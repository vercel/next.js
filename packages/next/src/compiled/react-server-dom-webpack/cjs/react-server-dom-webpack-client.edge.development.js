/**
 * @license React
 * react-server-dom-webpack-client.edge.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

if (process.env.NODE_ENV !== "production") {
  (function() {
'use strict';

var React = require('react');

function createStringDecoder() {
  return new TextDecoder();
}
var decoderOptions = {
  stream: true
};
function readPartialStringChunk(decoder, buffer) {
  return decoder.decode(buffer, decoderOptions);
}
function readFinalStringChunk(decoder, buffer) {
  return decoder.decode(buffer);
}

function parseModel(response, json) {
  return JSON.parse(json, response._fromJSON);
}

// eslint-disable-next-line no-unused-vars
function resolveClientReference(bundlerConfig, metadata) {
  if (bundlerConfig) {
    var resolvedModuleData = bundlerConfig[metadata.id][metadata.name];

    if (metadata.async) {
      return {
        id: resolvedModuleData.id,
        chunks: resolvedModuleData.chunks,
        name: resolvedModuleData.name,
        async: true
      };
    } else {
      return resolvedModuleData;
    }
  }

  return metadata;
}
// If they're still pending they're a thenable. This map also exists
// in Webpack but unfortunately it's not exposed so we have to
// replicate it in user space. null means that it has already loaded.

var chunkCache = new Map();
var asyncModuleCache = new Map();

function ignoreReject() {// We rely on rejected promises to be handled by another listener.
} // Start preloading the modules since we might need them soon.
// This function doesn't suspend.


function preloadModule(metadata) {
  var chunks = metadata.chunks;
  var promises = [];

  for (var i = 0; i < chunks.length; i++) {
    var chunkId = chunks[i];
    var entry = chunkCache.get(chunkId);

    if (entry === undefined) {
      var thenable = globalThis.__next_chunk_load__(chunkId);

      promises.push(thenable); // $FlowFixMe[method-unbinding]

      var resolve = chunkCache.set.bind(chunkCache, chunkId, null);
      thenable.then(resolve, ignoreReject);
      chunkCache.set(chunkId, thenable);
    } else if (entry !== null) {
      promises.push(entry);
    }
  }

  if (metadata.async) {
    var existingPromise = asyncModuleCache.get(metadata.id);

    if (existingPromise) {
      if (existingPromise.status === 'fulfilled') {
        return null;
      }

      return existingPromise;
    } else {
      var modulePromise = Promise.all(promises).then(function () {
        return globalThis.__next_require__(metadata.id);
      });
      modulePromise.then(function (value) {
        var fulfilledThenable = modulePromise;
        fulfilledThenable.status = 'fulfilled';
        fulfilledThenable.value = value;
      }, function (reason) {
        var rejectedThenable = modulePromise;
        rejectedThenable.status = 'rejected';
        rejectedThenable.reason = reason;
      });
      asyncModuleCache.set(metadata.id, modulePromise);
      return modulePromise;
    }
  } else if (promises.length > 0) {
    return Promise.all(promises);
  } else {
    return null;
  }
} // Actually require the module or suspend if it's not yet ready.
// Increase priority if necessary.

function requireModule(metadata) {
  var moduleExports;

  if (metadata.async) {
    // We assume that preloadModule has been called before, which
    // should have added something to the module cache.
    var promise = asyncModuleCache.get(metadata.id);

    if (promise.status === 'fulfilled') {
      moduleExports = promise.value;
    } else {
      throw promise.reason;
    }
  } else {
    moduleExports = globalThis.__next_require__(metadata.id);
  }

  if (metadata.name === '*') {
    // This is a placeholder value that represents that the caller imported this
    // as a CommonJS module as is.
    return moduleExports;
  }

  if (metadata.name === '') {
    // This is a placeholder value that represents that the caller accessed the
    // default property of this if it was an ESM interop module.
    return moduleExports.__esModule ? moduleExports.default : moduleExports;
  }

  return moduleExports[metadata.name];
}

var knownServerReferences = new WeakMap();

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
var REACT_ELEMENT_TYPE = Symbol.for('react.element');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
var REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED = Symbol.for('react.default_value');

var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

var ContextRegistry = ReactSharedInternals.ContextRegistry;
function getOrCreateServerContext(globalName) {
  if (!ContextRegistry[globalName]) {
    ContextRegistry[globalName] = React.createServerContext(globalName, // $FlowFixMe[incompatible-call] function signature doesn't reflect the symbol value
    REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED);
  }

  return ContextRegistry[globalName];
}

var PENDING = 'pending';
var BLOCKED = 'blocked';
var RESOLVED_MODEL = 'resolved_model';
var RESOLVED_MODULE = 'resolved_module';
var INITIALIZED = 'fulfilled';
var ERRORED = 'rejected'; // $FlowFixMe[missing-this-annot]

function Chunk(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
} // We subclass Promise.prototype so that we get other methods like .catch


Chunk.prototype = Object.create(Promise.prototype); // TODO: This doesn't return a new Promise chain unlike the real .then

Chunk.prototype.then = function (resolve, reject) {
  var chunk = this; // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.

  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;

    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  } // The status might have changed after initialization.


  switch (chunk.status) {
    case INITIALIZED:
      resolve(chunk.value);
      break;

    case PENDING:
    case BLOCKED:
      if (resolve) {
        if (chunk.value === null) {
          chunk.value = [];
        }

        chunk.value.push(resolve);
      }

      if (reject) {
        if (chunk.reason === null) {
          chunk.reason = [];
        }

        chunk.reason.push(reject);
      }

      break;

    default:
      reject(chunk.reason);
      break;
  }
};

function readChunk(chunk) {
  // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.
  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;

    case RESOLVED_MODULE:
      initializeModuleChunk(chunk);
      break;
  } // The status might have changed after initialization.


  switch (chunk.status) {
    case INITIALIZED:
      return chunk.value;

    case PENDING:
    case BLOCKED:
      // eslint-disable-next-line no-throw-literal
      throw chunk;

    default:
      throw chunk.reason;
  }
}

function getRoot(response) {
  var chunk = getChunk(response, 0);
  return chunk;
}

function createPendingChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(PENDING, null, null, response);
}

function createBlockedChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(BLOCKED, null, null, response);
}

function createErrorChunk(response, error) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(ERRORED, null, error, response);
}

function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    listener(value);
  }
}

function wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners) {
  switch (chunk.status) {
    case INITIALIZED:
      wakeChunk(resolveListeners, chunk.value);
      break;

    case PENDING:
    case BLOCKED:
      chunk.value = resolveListeners;
      chunk.reason = rejectListeners;
      break;

    case ERRORED:
      if (rejectListeners) {
        wakeChunk(rejectListeners, chunk.reason);
      }

      break;
  }
}

function triggerErrorOnChunk(chunk, error) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var listeners = chunk.reason;
  var erroredChunk = chunk;
  erroredChunk.status = ERRORED;
  erroredChunk.reason = error;

  if (listeners !== null) {
    wakeChunk(listeners, error);
  }
}

function createResolvedModelChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(RESOLVED_MODEL, value, null, response);
}

function createResolvedModuleChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(RESOLVED_MODULE, value, null, response);
}

function resolveModelChunk(chunk, value) {
  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODEL;
  resolvedChunk.value = value;

  if (resolveListeners !== null) {
    // This is unfortunate that we're reading this eagerly if
    // we already have listeners attached since they might no
    // longer be rendered or might not be the highest pri.
    initializeModelChunk(resolvedChunk); // The status might have changed after initialization.

    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}

function resolveModuleChunk(chunk, value) {
  if (chunk.status !== PENDING && chunk.status !== BLOCKED) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var resolveListeners = chunk.value;
  var rejectListeners = chunk.reason;
  var resolvedChunk = chunk;
  resolvedChunk.status = RESOLVED_MODULE;
  resolvedChunk.value = value;

  if (resolveListeners !== null) {
    initializeModuleChunk(resolvedChunk);
    wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
  }
}

var initializingChunk = null;
var initializingChunkBlockedModel = null;

function initializeModelChunk(chunk) {
  var prevChunk = initializingChunk;
  var prevBlocked = initializingChunkBlockedModel;
  initializingChunk = chunk;
  initializingChunkBlockedModel = null;

  try {
    var value = parseModel(chunk._response, chunk.value);

    if (initializingChunkBlockedModel !== null && initializingChunkBlockedModel.deps > 0) {
      initializingChunkBlockedModel.value = value; // We discovered new dependencies on modules that are not yet resolved.
      // We have to go the BLOCKED state until they're resolved.

      var blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
      blockedChunk.value = null;
      blockedChunk.reason = null;
    } else {
      var initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = value;
    }
  } catch (error) {
    var erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  } finally {
    initializingChunk = prevChunk;
    initializingChunkBlockedModel = prevBlocked;
  }
}

function initializeModuleChunk(chunk) {
  try {
    var value = requireModule(chunk.value);
    var initializedChunk = chunk;
    initializedChunk.status = INITIALIZED;
    initializedChunk.value = value;
  } catch (error) {
    var erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  }
} // Report that any missing chunks in the model is now going to throw this
// error upon read. Also notify any pending promises.


function reportGlobalError(response, error) {
  response._chunks.forEach(function (chunk) {
    // If this chunk was already resolved or errored, it won't
    // trigger an error but if it wasn't then we need to
    // because we won't be getting any new data to resolve it.
    if (chunk.status === PENDING) {
      triggerErrorOnChunk(chunk, error);
    }
  });
}

function createElement(type, key, props) {
  var element = {
    // This tag allows us to uniquely identify this as a React Element
    $$typeof: REACT_ELEMENT_TYPE,
    // Built-in properties that belong on the element
    type: type,
    key: key,
    ref: null,
    props: props,
    // Record the component responsible for creating this element.
    _owner: null
  };

  {
    // We don't really need to add any of these but keeping them for good measure.
    // Unfortunately, _store is enumerable in jest matchers so for equality to
    // work, I need to keep it or make _store non-enumerable in the other file.
    element._store = {};
    Object.defineProperty(element._store, 'validated', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: true // This element has already been validated on the server.

    });
    Object.defineProperty(element, '_self', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: null
    });
    Object.defineProperty(element, '_source', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: null
    });
  }

  return element;
}

function createLazyChunkWrapper(chunk) {
  var lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: readChunk
  };
  return lazyType;
}

function getChunk(response, id) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunk = createPendingChunk(response);
    chunks.set(id, chunk);
  }

  return chunk;
}

function createModelResolver(chunk, parentObject, key) {
  var blocked;

  if (initializingChunkBlockedModel) {
    blocked = initializingChunkBlockedModel;
    blocked.deps++;
  } else {
    blocked = initializingChunkBlockedModel = {
      deps: 1,
      value: null
    };
  }

  return function (value) {
    parentObject[key] = value;
    blocked.deps--;

    if (blocked.deps === 0) {
      if (chunk.status !== BLOCKED) {
        return;
      }

      var resolveListeners = chunk.value;
      var initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = blocked.value;

      if (resolveListeners !== null) {
        wakeChunk(resolveListeners, blocked.value);
      }
    }
  };
}

function createModelReject(chunk) {
  return function (error) {
    return triggerErrorOnChunk(chunk, error);
  };
}

function createServerReferenceProxy(response, metaData) {
  var callServer = response._callServer;

  var proxy = function () {
    // $FlowFixMe[method-unbinding]
    var args = Array.prototype.slice.call(arguments);
    var p = metaData.bound;

    if (!p) {
      return callServer(metaData.id, args);
    }

    if (p.status === INITIALIZED) {
      var bound = p.value;
      return callServer(metaData.id, bound.concat(args));
    } // Since this is a fake Promise whose .then doesn't chain, we have to wrap it.
    // TODO: Remove the wrapper once that's fixed.


    return Promise.resolve(p).then(function (bound) {
      return callServer(metaData.id, bound.concat(args));
    });
  };

  knownServerReferences.set(proxy, metaData);
  return proxy;
}

function parseModelString(response, parentObject, key, value) {
  if (value[0] === '$') {
    if (value === '$') {
      // A very common symbol.
      return REACT_ELEMENT_TYPE;
    }

    switch (value[1]) {
      case '$':
        {
          // This was an escaped string value.
          return value.substring(1);
        }

      case 'L':
        {
          // Lazy node
          var id = parseInt(value.substring(2), 16);
          var chunk = getChunk(response, id); // We create a React.lazy wrapper around any lazy values.
          // When passed into React, we'll know how to suspend on this.

          return createLazyChunkWrapper(chunk);
        }

      case '@':
        {
          // Promise
          var _id = parseInt(value.substring(2), 16);

          var _chunk = getChunk(response, _id);

          return _chunk;
        }

      case 'S':
        {
          // Symbol
          return Symbol.for(value.substring(2));
        }

      case 'P':
        {
          // Server Context Provider
          return getOrCreateServerContext(value.substring(2)).Provider;
        }

      case 'F':
        {
          // Server Reference
          var _id2 = parseInt(value.substring(2), 16);

          var _chunk2 = getChunk(response, _id2);

          switch (_chunk2.status) {
            case RESOLVED_MODEL:
              initializeModelChunk(_chunk2);
              break;
          } // The status might have changed after initialization.


          switch (_chunk2.status) {
            case INITIALIZED:
              {
                var metadata = _chunk2.value;
                return createServerReferenceProxy(response, metadata);
              }
            // We always encode it first in the stream so it won't be pending.

            default:
              throw _chunk2.reason;
          }
        }

      case 'u':
        {
          // matches "$undefined"
          // Special encoding for `undefined` which can't be serialized as JSON otherwise.
          return undefined;
        }

      default:
        {
          // We assume that anything else is a reference ID.
          var _id3 = parseInt(value.substring(1), 16);

          var _chunk3 = getChunk(response, _id3);

          switch (_chunk3.status) {
            case RESOLVED_MODEL:
              initializeModelChunk(_chunk3);
              break;

            case RESOLVED_MODULE:
              initializeModuleChunk(_chunk3);
              break;
          } // The status might have changed after initialization.


          switch (_chunk3.status) {
            case INITIALIZED:
              return _chunk3.value;

            case PENDING:
            case BLOCKED:
              var parentChunk = initializingChunk;

              _chunk3.then(createModelResolver(parentChunk, parentObject, key), createModelReject(parentChunk));

              return null;

            default:
              throw _chunk3.reason;
          }
        }
    }
  }

  return value;
}
function parseModelTuple(response, value) {
  var tuple = value;

  if (tuple[0] === REACT_ELEMENT_TYPE) {
    // TODO: Consider having React just directly accept these arrays as elements.
    // Or even change the ReactElement type to be an array.
    return createElement(tuple[1], tuple[2], tuple[3]);
  }

  return value;
}

function missingCall() {
  throw new Error('Trying to call a function from "use server" but the callServer option ' + 'was not implemented in your router runtime.');
}

function createResponse$1(bundlerConfig, callServer) {
  var chunks = new Map();
  var response = {
    _bundlerConfig: bundlerConfig,
    _callServer: callServer !== undefined ? callServer : missingCall,
    _chunks: chunks
  };
  return response;
}
function resolveModel(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunks.set(id, createResolvedModelChunk(response, model));
  } else {
    resolveModelChunk(chunk, model);
  }
}
function resolveModule(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  var clientReferenceMetadata = parseModel(response, model);
  var clientReference = resolveClientReference(response._bundlerConfig, clientReferenceMetadata); // TODO: Add an option to encode modules that are lazy loaded.
  // For now we preload all modules as early as possible since it's likely
  // that we'll need them.

  var promise = preloadModule(clientReference);

  if (promise) {
    var blockedChunk;

    if (!chunk) {
      // Technically, we should just treat promise as the chunk in this
      // case. Because it'll just behave as any other promise.
      blockedChunk = createBlockedChunk(response);
      chunks.set(id, blockedChunk);
    } else {
      // This can't actually happen because we don't have any forward
      // references to modules.
      blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
    }

    promise.then(function () {
      return resolveModuleChunk(blockedChunk, clientReference);
    }, function (error) {
      return triggerErrorOnChunk(blockedChunk, error);
    });
  } else {
    if (!chunk) {
      chunks.set(id, createResolvedModuleChunk(response, clientReference));
    } else {
      // This can't actually happen because we don't have any forward
      // references to modules.
      resolveModuleChunk(chunk, clientReference);
    }
  }
}
function resolveErrorDev(response, id, digest, message, stack) {


  var error = new Error(message || 'An error occurred in the Server Components render but no message was provided');
  error.stack = stack;
  error.digest = digest;
  var errorWithDigest = error;
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunks.set(id, createErrorChunk(response, errorWithDigest));
  } else {
    triggerErrorOnChunk(chunk, errorWithDigest);
  }
}
function close(response) {
  // In case there are any remaining unresolved chunks, they won't
  // be resolved now. So we need to issue an error to those.
  // Ideally we should be able to early bail out if we kept a
  // ref count of pending chunks.
  reportGlobalError(response, new Error('Connection closed.'));
}

function processFullRow(response, row) {
  if (row === '') {
    return;
  }

  var colon = row.indexOf(':', 0);
  var id = parseInt(row.substring(0, colon), 16);
  var tag = row[colon + 1]; // When tags that are not text are added, check them here before
  // parsing the row as text.
  // switch (tag) {
  // }

  switch (tag) {
    case 'I':
      {
        resolveModule(response, id, row.substring(colon + 2));
        return;
      }

    case 'E':
      {
        var errorInfo = JSON.parse(row.substring(colon + 2));

        {
          resolveErrorDev(response, id, errorInfo.digest, errorInfo.message, errorInfo.stack);
        }

        return;
      }

    default:
      {
        // We assume anything else is JSON.
        resolveModel(response, id, row.substring(colon + 1));
        return;
      }
  }
}
function processBinaryChunk(response, chunk) {

  var stringDecoder = response._stringDecoder;
  var linebreak = chunk.indexOf(10); // newline

  while (linebreak > -1) {
    var fullrow = response._partialRow + readFinalStringChunk(stringDecoder, chunk.subarray(0, linebreak));
    processFullRow(response, fullrow);
    response._partialRow = '';
    chunk = chunk.subarray(linebreak + 1);
    linebreak = chunk.indexOf(10); // newline
  }

  response._partialRow += readPartialStringChunk(stringDecoder, chunk);
}

function createFromJSONCallback(response) {
  // $FlowFixMe[missing-this-annot]
  return function (key, value) {
    if (typeof value === 'string') {
      // We can't use .bind here because we need the "this" value.
      return parseModelString(response, this, key, value);
    }

    if (typeof value === 'object' && value !== null) {
      return parseModelTuple(response, value);
    }

    return value;
  };
}

function createResponse(bundlerConfig, callServer) {
  // NOTE: CHECK THE COMPILER OUTPUT EACH TIME YOU CHANGE THIS.
  // It should be inlined to one object literal but minor changes can break it.
  var stringDecoder = createStringDecoder() ;
  var response = createResponse$1(bundlerConfig, callServer);
  response._partialRow = '';

  {
    response._stringDecoder = stringDecoder;
  } // Don't inline this call because it causes closure to outline the call above.


  response._fromJSON = createFromJSONCallback(response);
  return response;
}

function noServerCall() {
  throw new Error('Server Functions cannot be called during initial render. ' + 'This would create a fetch waterfall. Try to use a Server Component ' + 'to pass data to Client Components instead.');
}

function createResponseFromOptions(options) {
  return createResponse(options && options.moduleMap ? options.moduleMap : null, noServerCall);
}

function startReadingFromStream(response, stream) {
  var reader = stream.getReader();

  function progress(_ref) {
    var done = _ref.done,
        value = _ref.value;

    if (done) {
      close(response);
      return;
    }

    var buffer = value;
    processBinaryChunk(response, buffer);
    return reader.read().then(progress).catch(error);
  }

  function error(e) {
    reportGlobalError(response, e);
  }

  reader.read().then(progress).catch(error);
}

function createFromReadableStream(stream, options) {
  var response = createResponseFromOptions(options);
  startReadingFromStream(response, stream);
  return getRoot(response);
}

function createFromFetch(promiseForResponse, options) {
  var response = createResponseFromOptions(options);
  promiseForResponse.then(function (r) {
    startReadingFromStream(response, r.body);
  }, function (e) {
    reportGlobalError(response, e);
  });
  return getRoot(response);
}

exports.createFromFetch = createFromFetch;
exports.createFromReadableStream = createFromReadableStream;
  })();
}
