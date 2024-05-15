/**
 * @license React
 * react-server-dom-turbopack-client.browser.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var ReactDOM = require("react-dom"),
  decoderOptions = { stream: !0 };
function resolveClientReference(bundlerConfig, metadata) {
  if (bundlerConfig) {
    var moduleExports = bundlerConfig[metadata[0]];
    if ((bundlerConfig = moduleExports[metadata[2]]))
      moduleExports = bundlerConfig.name;
    else {
      bundlerConfig = moduleExports["*"];
      if (!bundlerConfig)
        throw Error(
          'Could not find the module "' +
            metadata[0] +
            '" in the React SSR Manifest. This is probably a bug in the React Server Components bundler.'
        );
      moduleExports = metadata[2];
    }
    return 4 === metadata.length
      ? [bundlerConfig.id, bundlerConfig.chunks, moduleExports, 1]
      : [bundlerConfig.id, bundlerConfig.chunks, moduleExports];
  }
  return metadata;
}
var chunkCache = new Map();
function requireAsyncModule(id) {
  var promise = __turbopack_require__(id);
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
  for (var chunks = metadata[1], promises = [], i = 0; i < chunks.length; i++) {
    var chunkFilename = chunks[i],
      entry = chunkCache.get(chunkFilename);
    if (void 0 === entry) {
      entry = __turbopack_load__(chunkFilename);
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
var isArrayImpl = Array.isArray,
  getPrototypeOf = Object.getPrototypeOf;
function writeTemporaryReference(set, object) {
  var newId = set.length;
  set.push(object);
  return newId;
}
var ObjectPrototype = Object.prototype,
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
  function resolveToJSON(key, value) {
    if (null === value) return null;
    if ("object" === typeof value) {
      switch (value.$$typeof) {
        case REACT_ELEMENT_TYPE:
          if (void 0 === temporaryReferences)
            throw Error(
              "React Element cannot be passed to Server Functions from the Client without a temporary reference set. Pass a TemporaryReferenceSet to the options."
            );
          return (
            "$T" +
            writeTemporaryReference(temporaryReferences, value).toString(16)
          );
        case REACT_LAZY_TYPE:
          key = value._payload;
          var init = value._init;
          null === formData && (formData = new FormData());
          pendingParts++;
          try {
            var resolvedModel = init(key),
              lazyId = nextPartId++,
              partJSON = JSON.stringify(resolvedModel, resolveToJSON);
            formData.append(formFieldPrefix + lazyId, partJSON);
            return "$" + lazyId.toString(16);
          } catch (x) {
            if (
              "object" === typeof x &&
              null !== x &&
              "function" === typeof x.then
            ) {
              pendingParts++;
              var lazyId$21 = nextPartId++;
              resolvedModel = function () {
                try {
                  var partJSON$22 = JSON.stringify(value, resolveToJSON),
                    data$23 = formData;
                  data$23.append(formFieldPrefix + lazyId$21, partJSON$22);
                  pendingParts--;
                  0 === pendingParts && resolve(data$23);
                } catch (reason) {
                  reject(reason);
                }
              };
              x.then(resolvedModel, resolvedModel);
              return "$" + lazyId$21.toString(16);
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
        value.then(
          function (partValue) {
            try {
              var partJSON$25 = JSON.stringify(partValue, resolveToJSON);
              partValue = formData;
              partValue.append(formFieldPrefix + promiseId, partJSON$25);
              pendingParts--;
              0 === pendingParts && resolve(partValue);
            } catch (reason) {
              reject(reason);
            }
          },
          function (reason) {
            reject(reason);
          }
        );
        return "$@" + promiseId.toString(16);
      }
      if (isArrayImpl(value)) return value;
      if (value instanceof FormData) {
        null === formData && (formData = new FormData());
        var data$27 = formData;
        resolvedModel = nextPartId++;
        var prefix = formFieldPrefix + resolvedModel + "_";
        value.forEach(function (originalValue, originalKey) {
          data$27.append(prefix + originalKey, originalValue);
        });
        return "$K" + resolvedModel.toString(16);
      }
      if (value instanceof Map)
        return (
          (resolvedModel = JSON.stringify(Array.from(value), resolveToJSON)),
          null === formData && (formData = new FormData()),
          (lazyId = nextPartId++),
          formData.append(formFieldPrefix + lazyId, resolvedModel),
          "$Q" + lazyId.toString(16)
        );
      if (value instanceof Set)
        return (
          (resolvedModel = JSON.stringify(Array.from(value), resolveToJSON)),
          null === formData && (formData = new FormData()),
          (lazyId = nextPartId++),
          formData.append(formFieldPrefix + lazyId, resolvedModel),
          "$W" + lazyId.toString(16)
        );
      if ((resolvedModel = getIteratorFn(value)))
        return (
          (resolvedModel = resolvedModel.call(value)),
          resolvedModel === value
            ? ((resolvedModel = JSON.stringify(
                Array.from(resolvedModel),
                resolveToJSON
              )),
              null === formData && (formData = new FormData()),
              (lazyId = nextPartId++),
              formData.append(formFieldPrefix + lazyId, resolvedModel),
              "$i" + lazyId.toString(16))
            : Array.from(resolvedModel)
        );
      resolvedModel = getPrototypeOf(value);
      if (
        resolvedModel !== ObjectPrototype &&
        (null === resolvedModel || null !== getPrototypeOf(resolvedModel))
      ) {
        if (void 0 === temporaryReferences)
          throw Error(
            "Only plain objects, and a few built-ins, can be passed to Server Actions. Classes or null prototypes are not supported."
          );
        return (
          "$T" +
          writeTemporaryReference(temporaryReferences, value).toString(16)
        );
      }
      return value;
    }
    if ("string" === typeof value) {
      if ("Z" === value[value.length - 1] && this[key] instanceof Date)
        return "$D" + value;
      resolvedModel = "$" === value[0] ? "$" + value : value;
      return resolvedModel;
    }
    if ("boolean" === typeof value) return value;
    if ("number" === typeof value) return serializeNumber(value);
    if ("undefined" === typeof value) return "$undefined";
    if ("function" === typeof value) {
      resolvedModel = knownServerReferences.get(value);
      if (void 0 !== resolvedModel)
        return (
          (resolvedModel = JSON.stringify(resolvedModel, resolveToJSON)),
          null === formData && (formData = new FormData()),
          (lazyId = nextPartId++),
          formData.set(formFieldPrefix + lazyId, resolvedModel),
          "$F" + lazyId.toString(16)
        );
      if (void 0 === temporaryReferences)
        throw Error(
          "Client Functions cannot be passed directly to Server Functions. Only Functions passed from the Server can be passed back again."
        );
      return (
        "$T" + writeTemporaryReference(temporaryReferences, value).toString(16)
      );
    }
    if ("symbol" === typeof value) {
      if (void 0 === temporaryReferences)
        throw Error(
          "Symbols cannot be passed to a Server Function without a temporary reference set. Pass a TemporaryReferenceSet to the options."
        );
      return (
        "$T" + writeTemporaryReference(temporaryReferences, value).toString(16)
      );
    }
    if ("bigint" === typeof value) return "$n" + value.toString(10);
    throw Error(
      "Type " +
        typeof value +
        " is not supported as an argument to a Server Function."
    );
  }
  var nextPartId = 1,
    pendingParts = 0,
    formData = null;
  root = JSON.stringify(root, resolveToJSON);
  null === formData
    ? resolve(root)
    : (formData.set(formFieldPrefix + "0", root),
      0 === pendingParts && resolve(formData));
}
function registerServerReference(proxy, reference) {
  knownServerReferences.set(proxy, reference);
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
    case "cyclic":
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
    case "cyclic":
      throw chunk;
    default:
      throw chunk.reason;
  }
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
    case "cyclic":
      chunk.value = resolveListeners;
      chunk.reason = rejectListeners;
      break;
    case "rejected":
      rejectListeners && wakeChunk(rejectListeners, chunk.reason);
  }
}
function triggerErrorOnChunk(chunk, error) {
  if ("pending" === chunk.status || "blocked" === chunk.status) {
    var listeners = chunk.reason;
    chunk.status = "rejected";
    chunk.reason = error;
    null !== listeners && wakeChunk(listeners, error);
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
var initializingChunk = null,
  initializingChunkBlockedModel = null;
function initializeModelChunk(chunk) {
  var prevChunk = initializingChunk,
    prevBlocked = initializingChunkBlockedModel;
  initializingChunk = chunk;
  initializingChunkBlockedModel = null;
  var resolvedModel = chunk.value;
  chunk.status = "cyclic";
  chunk.value = null;
  chunk.reason = null;
  try {
    var value = JSON.parse(resolvedModel, chunk._response._fromJSON);
    if (
      null !== initializingChunkBlockedModel &&
      0 < initializingChunkBlockedModel.deps
    )
      (initializingChunkBlockedModel.value = value),
        (chunk.status = "blocked"),
        (chunk.value = null),
        (chunk.reason = null);
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
function initializeModuleChunk(chunk) {
  try {
    var metadata = chunk.value,
      moduleExports = __turbopack_require__(metadata[0]);
    if (4 === metadata.length && "function" === typeof moduleExports.then)
      if ("fulfilled" === moduleExports.status)
        moduleExports = moduleExports.value;
      else throw moduleExports.reason;
    var JSCompiler_inline_result =
      "*" === metadata[2]
        ? moduleExports
        : "" === metadata[2]
        ? moduleExports.__esModule
          ? moduleExports.default
          : moduleExports
        : moduleExports[metadata[2]];
    chunk.status = "fulfilled";
    chunk.value = JSCompiler_inline_result;
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
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
    ((chunk = new Chunk("pending", null, null, response)),
    chunks.set(id, chunk));
  return chunk;
}
function createModelResolver(chunk, parentObject, key, cyclic, response, map) {
  if (initializingChunkBlockedModel) {
    var blocked = initializingChunkBlockedModel;
    cyclic || blocked.deps++;
  } else
    blocked = initializingChunkBlockedModel = {
      deps: cyclic ? 0 : 1,
      value: null
    };
  return function (value) {
    parentObject[key] = map(response, value);
    "" === key && null === blocked.value && (blocked.value = parentObject[key]);
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
  knownServerReferences.set(proxy, metaData);
  return proxy;
}
function getOutlinedModel(response, id, parentObject, key, map) {
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
      return map(response, id.value);
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
          map
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
    if ("$" === value) return REACT_ELEMENT_TYPE;
    switch (value[1]) {
      case "$":
        return value.slice(1);
      case "L":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          (response = getChunk(response, parentObject)),
          { $$typeof: REACT_LAZY_TYPE, _payload: response, _init: readChunk }
        );
      case "@":
        if (2 === value.length) return new Promise(function () {});
        parentObject = parseInt(value.slice(2), 16);
        return getChunk(response, parentObject);
      case "S":
        return Symbol.for(value.slice(2));
      case "F":
        return (
          (value = parseInt(value.slice(2), 16)),
          getOutlinedModel(
            response,
            value,
            parentObject,
            key,
            createServerReferenceProxy
          )
        );
      case "T":
        parentObject = parseInt(value.slice(2), 16);
        response = response._tempRefs;
        if (null == response)
          throw Error(
            "Missing a temporary reference set but the RSC response returned a temporary reference. Pass a temporaryReference option with the set that was used with the reply."
          );
        if (0 > parentObject || parentObject >= response.length)
          throw Error(
            "The RSC response contained a reference that doesn't exist in the temporary reference set. Always pass the matching set that was used to create the reply when parsing its response."
          );
        return response[parentObject];
      case "Q":
        return (
          (value = parseInt(value.slice(2), 16)),
          getOutlinedModel(response, value, parentObject, key, createMap)
        );
      case "W":
        return (
          (value = parseInt(value.slice(2), 16)),
          getOutlinedModel(response, value, parentObject, key, createSet)
        );
      case "B":
        return;
      case "K":
        return (
          (value = parseInt(value.slice(2), 16)),
          getOutlinedModel(response, value, parentObject, key, createFormData)
        );
      case "i":
        return (
          (value = parseInt(value.slice(2), 16)),
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
          (value = parseInt(value.slice(1), 16)),
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
function resolveModule(response, id, model) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  model = JSON.parse(model, response._fromJSON);
  var clientReference = resolveClientReference(response._bundlerConfig, model);
  if ((model = preloadModule(clientReference))) {
    if (chunk) {
      var blockedChunk = chunk;
      blockedChunk.status = "blocked";
    } else
      (blockedChunk = new Chunk("blocked", null, null, response)),
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
          new Chunk("resolved_module", clientReference, null, response)
        );
}
function createFromJSONCallback(response) {
  return function (key, value) {
    return "string" === typeof value
      ? parseModelString(response, this, key, value)
      : "object" === typeof value && null !== value
      ? ((key =
          value[0] === REACT_ELEMENT_TYPE
            ? {
                $$typeof: REACT_ELEMENT_TYPE,
                type: value[1],
                key: value[2],
                ref: null,
                props: value[3]
              }
            : value),
        key)
      : value;
  };
}
function createResponseFromOptions(options) {
  var callServer = options && options.callServer ? options.callServer : void 0;
  options =
    options && options.temporaryReferences
      ? options.temporaryReferences
      : void 0;
  var chunks = new Map();
  callServer = {
    _bundlerConfig: null,
    _moduleLoading: null,
    _callServer: void 0 !== callServer ? callServer : missingCall,
    _encodeFormAction: void 0,
    _nonce: void 0,
    _chunks: chunks,
    _stringDecoder: new TextDecoder(),
    _fromJSON: null,
    _rowState: 0,
    _rowID: 0,
    _rowTag: 0,
    _rowLength: 0,
    _buffer: [],
    _tempRefs: options
  };
  callServer._fromJSON = createFromJSONCallback(callServer);
  return callServer;
}
function startReadingFromStream(response, stream) {
  function progress(_ref) {
    var value = _ref.value;
    if (_ref.done) reportGlobalError(response, Error("Connection closed."));
    else {
      var i = 0,
        rowState = response._rowState,
        rowID = response._rowID,
        rowTag = response._rowTag,
        rowLength = response._rowLength;
      _ref = response._buffer;
      for (var chunkLength = value.length; i < chunkLength; ) {
        var lastIdx = -1;
        switch (rowState) {
          case 0:
            lastIdx = value[i++];
            58 === lastIdx
              ? (rowState = 1)
              : (rowID =
                  (rowID << 4) | (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
            continue;
          case 1:
            rowState = value[i];
            84 === rowState
              ? ((rowTag = rowState), (rowState = 2), i++)
              : (64 < rowState && 91 > rowState) ||
                114 === rowState ||
                120 === rowState
              ? ((rowTag = rowState), (rowState = 3), i++)
              : ((rowTag = 0), (rowState = 3));
            continue;
          case 2:
            lastIdx = value[i++];
            44 === lastIdx
              ? (rowState = 4)
              : (rowLength =
                  (rowLength << 4) |
                  (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
            continue;
          case 3:
            lastIdx = value.indexOf(10, i);
            break;
          case 4:
            (lastIdx = i + rowLength), lastIdx > value.length && (lastIdx = -1);
        }
        var offset = value.byteOffset + i;
        if (-1 < lastIdx) {
          i = new Uint8Array(value.buffer, offset, lastIdx - i);
          rowLength = response;
          offset = rowTag;
          var stringDecoder = rowLength._stringDecoder;
          rowTag = "";
          for (var i$jscomp$0 = 0; i$jscomp$0 < _ref.length; i$jscomp$0++)
            rowTag += stringDecoder.decode(_ref[i$jscomp$0], decoderOptions);
          rowTag += stringDecoder.decode(i);
          switch (offset) {
            case 73:
              resolveModule(rowLength, rowID, rowTag);
              break;
            case 72:
              rowID = rowTag[0];
              rowTag = rowTag.slice(1);
              rowLength = JSON.parse(rowTag, rowLength._fromJSON);
              rowTag = ReactDOMSharedInternals.d;
              switch (rowID) {
                case "D":
                  rowTag.D(rowLength);
                  break;
                case "C":
                  "string" === typeof rowLength
                    ? rowTag.C(rowLength)
                    : rowTag.C(rowLength[0], rowLength[1]);
                  break;
                case "L":
                  rowID = rowLength[0];
                  i = rowLength[1];
                  3 === rowLength.length
                    ? rowTag.L(rowID, i, rowLength[2])
                    : rowTag.L(rowID, i);
                  break;
                case "m":
                  "string" === typeof rowLength
                    ? rowTag.m(rowLength)
                    : rowTag.m(rowLength[0], rowLength[1]);
                  break;
                case "X":
                  "string" === typeof rowLength
                    ? rowTag.X(rowLength)
                    : rowTag.X(rowLength[0], rowLength[1]);
                  break;
                case "S":
                  "string" === typeof rowLength
                    ? rowTag.S(rowLength)
                    : rowTag.S(
                        rowLength[0],
                        0 === rowLength[1] ? void 0 : rowLength[1],
                        3 === rowLength.length ? rowLength[2] : void 0
                      );
                  break;
                case "M":
                  "string" === typeof rowLength
                    ? rowTag.M(rowLength)
                    : rowTag.M(rowLength[0], rowLength[1]);
              }
              break;
            case 69:
              rowTag = JSON.parse(rowTag);
              i = rowTag.digest;
              rowTag = Error(
                "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."
              );
              rowTag.stack = "Error: " + rowTag.message;
              rowTag.digest = i;
              i = rowLength._chunks;
              (offset = i.get(rowID))
                ? triggerErrorOnChunk(offset, rowTag)
                : i.set(rowID, new Chunk("rejected", null, rowTag, rowLength));
              break;
            case 84:
              rowLength._chunks.set(
                rowID,
                new Chunk("fulfilled", rowTag, null, rowLength)
              );
              break;
            case 68:
            case 87:
              throw Error(
                "Failed to read a RSC payload created by a development version of React on the server while using a production version on the client. Always use matching versions on the server and the client."
              );
            default:
              (i = rowLength._chunks),
                (offset = i.get(rowID))
                  ? ((rowLength = offset),
                    (rowID = rowTag),
                    "pending" === rowLength.status &&
                      ((rowTag = rowLength.value),
                      (i = rowLength.reason),
                      (rowLength.status = "resolved_model"),
                      (rowLength.value = rowID),
                      null !== rowTag &&
                        (initializeModelChunk(rowLength),
                        wakeChunkIfInitialized(rowLength, rowTag, i))))
                  : i.set(
                      rowID,
                      new Chunk("resolved_model", rowTag, null, rowLength)
                    );
          }
          i = lastIdx;
          3 === rowState && i++;
          rowLength = rowID = rowTag = rowState = 0;
          _ref.length = 0;
        } else {
          value = new Uint8Array(value.buffer, offset, value.byteLength - i);
          _ref.push(value);
          rowLength -= value.byteLength;
          break;
        }
      }
      response._rowState = rowState;
      response._rowID = rowID;
      response._rowTag = rowTag;
      response._rowLength = rowLength;
      return reader.read().then(progress).catch(error);
    }
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  var reader = stream.getReader();
  reader.read().then(progress).catch(error);
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
exports.createFromReadableStream = function (stream, options) {
  options = createResponseFromOptions(options);
  startReadingFromStream(options, stream);
  return getChunk(options, 0);
};
exports.createServerReference = function (id, callServer) {
  function proxy() {
    var args = Array.prototype.slice.call(arguments);
    return callServer(id, args);
  }
  registerServerReference(proxy, { id: id, bound: null });
  return proxy;
};
exports.createTemporaryReferenceSet = function () {
  return [];
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
      reject
    );
  });
};
