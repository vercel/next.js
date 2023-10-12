/**
 * @license React
 * react-server-dom-webpack-client.node.development.js
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

var util = require('util');
var ReactDOM = require('react-dom');
var React = require('react');

function createStringDecoder() {
  return new util.TextDecoder();
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

// This is the parsed shape of the wire format which is why it is
// condensed to only the essentialy information
var ID = 0;
var CHUNKS = 1;
var NAME = 2; // export const ASYNC = 3;
// This logic is correct because currently only include the 4th tuple member
// when the module is async. If that changes we will need to actually assert
// the value is true. We don't index into the 4th slot because flow does not
// like the potential out of bounds access

function isAsyncImport(metadata) {
  return metadata.length === 4;
}

// The reason this function needs to defined here in this file instead of just
// being exported directly from the WebpackDestination... file is because the
// ClientReferenceMetadata is opaque and we can't unwrap it there.
// This should get inlined and we could also just implement an unwrapping function
// though that risks it getting used in places it shouldn't be. This is unfortunate
// but currently it seems to be the best option we have.

function prepareDestinationForModule(moduleLoading, nonce, metadata) {
  prepareDestinationWithChunks(moduleLoading, metadata[CHUNKS], nonce);
}
function resolveClientReference(bundlerConfig, metadata) {
  if (bundlerConfig) {
    var moduleExports = bundlerConfig[metadata[ID]];
    var resolvedModuleData = moduleExports[metadata[NAME]];
    var name;

    if (resolvedModuleData) {
      // The potentially aliased name.
      name = resolvedModuleData.name;
    } else {
      // If we don't have this specific name, we might have the full module.
      resolvedModuleData = moduleExports['*'];

      if (!resolvedModuleData) {
        throw new Error('Could not find the module "' + metadata[ID] + '" in the React SSR Manifest. ' + 'This is probably a bug in the React Server Components bundler.');
      }

      name = metadata[NAME];
    }

    if (isAsyncImport(metadata)) {
      return [resolvedModuleData.id, resolvedModuleData.chunks, name, 1
      /* async */
      ];
    } else {
      return [resolvedModuleData.id, resolvedModuleData.chunks, name];
    }
  }

  return metadata;
}
// If they're still pending they're a thenable. This map also exists
// in Webpack but unfortunately it's not exposed so we have to
// replicate it in user space. null means that it has already loaded.

var chunkCache = new Map();

function requireAsyncModule(id) {
  // We've already loaded all the chunks. We can require the module.
  var promise = globalThis.__next_require__(id);

  if (typeof promise.then !== 'function') {
    // This wasn't a promise after all.
    return null;
  } else if (promise.status === 'fulfilled') {
    // This module was already resolved earlier.
    return null;
  } else {
    // Instrument the Promise to stash the result.
    promise.then(function (value) {
      var fulfilledThenable = promise;
      fulfilledThenable.status = 'fulfilled';
      fulfilledThenable.value = value;
    }, function (reason) {
      var rejectedThenable = promise;
      rejectedThenable.status = 'rejected';
      rejectedThenable.reason = reason;
    });
    return promise;
  }
}

function ignoreReject() {// We rely on rejected promises to be handled by another listener.
} // Start preloading the modules since we might need them soon.
// This function doesn't suspend.


function preloadModule(metadata) {
  var chunks = metadata[CHUNKS];
  var promises = [];
  var i = 0;

  while (i < chunks.length) {
    var chunkId = chunks[i++];
    chunks[i++];
    var entry = chunkCache.get(chunkId);

    if (entry === undefined) {
      var thenable = loadChunk(chunkId);
      promises.push(thenable); // $FlowFixMe[method-unbinding]

      var resolve = chunkCache.set.bind(chunkCache, chunkId, null);
      thenable.then(resolve, ignoreReject);
      chunkCache.set(chunkId, thenable);
    } else if (entry !== null) {
      promises.push(entry);
    }
  }

  if (isAsyncImport(metadata)) {
    if (promises.length === 0) {
      return requireAsyncModule(metadata[ID]);
    } else {
      return Promise.all(promises).then(function () {
        return requireAsyncModule(metadata[ID]);
      });
    }
  } else if (promises.length > 0) {
    return Promise.all(promises);
  } else {
    return null;
  }
} // Actually require the module or suspend if it's not yet ready.
// Increase priority if necessary.

function requireModule(metadata) {
  var moduleExports = globalThis.__next_require__(metadata[ID]);

  if (isAsyncImport(metadata)) {
    if (typeof moduleExports.then !== 'function') ; else if (moduleExports.status === 'fulfilled') {
      // This Promise should've been instrumented by preloadModule.
      moduleExports = moduleExports.value;
    } else {
      throw moduleExports.reason;
    }
  }

  if (metadata[NAME] === '*') {
    // This is a placeholder value that represents that the caller imported this
    // as a CommonJS module as is.
    return moduleExports;
  }

  if (metadata[NAME] === '') {
    // This is a placeholder value that represents that the caller accessed the
    // default property of this if it was an ESM interop module.
    return moduleExports.__esModule ? moduleExports.default : moduleExports;
  }

  return moduleExports[metadata[NAME]];
}

function loadChunk(chunkId, filename) {
  return __webpack_chunk_load__(chunkId);
}

function prepareDestinationWithChunks(moduleLoading, // Chunks are double-indexed [..., idx, filenamex, idy, filenamey, ...]
chunks, nonce) {
  if (moduleLoading !== null) {
    for (var i = 1; i < chunks.length; i += 2) {
      preinitScriptForSSR(moduleLoading.prefix + chunks[i], nonce, moduleLoading.crossOrigin);
    }
  }
}

var ReactDOMSharedInternals = ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function getCrossOriginString(input) {
  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}

// This client file is in the shared folder because it applies to both SSR and browser contexts.
var ReactDOMCurrentDispatcher = ReactDOMSharedInternals.Dispatcher;
function dispatchHint(code, model) {
  var dispatcher = ReactDOMCurrentDispatcher.current;

  if (dispatcher) {
    switch (code) {
      case 'D':
        {
          var refined = refineModel(code, model);
          var href = refined;
          dispatcher.prefetchDNS(href);
          return;
        }

      case 'C':
        {
          var _refined = refineModel(code, model);

          if (typeof _refined === 'string') {
            var _href = _refined;
            dispatcher.preconnect(_href);
          } else {
            var _href2 = _refined[0];
            var crossOrigin = _refined[1];
            dispatcher.preconnect(_href2, crossOrigin);
          }

          return;
        }

      case 'L':
        {
          var _refined2 = refineModel(code, model);

          var _href3 = _refined2[0];
          var as = _refined2[1];

          if (_refined2.length === 3) {
            var options = _refined2[2];
            dispatcher.preload(_href3, as, options);
          } else {
            dispatcher.preload(_href3, as);
          }

          return;
        }

      case 'm':
        {
          var _refined3 = refineModel(code, model);

          if (typeof _refined3 === 'string') {
            var _href4 = _refined3;
            dispatcher.preloadModule(_href4);
          } else {
            var _href5 = _refined3[0];
            var _options = _refined3[1];
            dispatcher.preloadModule(_href5, _options);
          }

          return;
        }

      case 'S':
        {
          var _refined4 = refineModel(code, model);

          if (typeof _refined4 === 'string') {
            var _href6 = _refined4;
            dispatcher.preinitStyle(_href6);
          } else {
            var _href7 = _refined4[0];
            var precedence = _refined4[1] === 0 ? undefined : _refined4[1];

            var _options2 = _refined4.length === 3 ? _refined4[2] : undefined;

            dispatcher.preinitStyle(_href7, precedence, _options2);
          }

          return;
        }

      case 'X':
        {
          var _refined5 = refineModel(code, model);

          if (typeof _refined5 === 'string') {
            var _href8 = _refined5;
            dispatcher.preinitScript(_href8);
          } else {
            var _href9 = _refined5[0];
            var _options3 = _refined5[1];
            dispatcher.preinitScript(_href9, _options3);
          }

          return;
        }

      case 'M':
        {
          var _refined6 = refineModel(code, model);

          if (typeof _refined6 === 'string') {
            var _href10 = _refined6;
            dispatcher.preinitModuleScript(_href10);
          } else {
            var _href11 = _refined6[0];
            var _options4 = _refined6[1];
            dispatcher.preinitModuleScript(_href11, _options4);
          }

          return;
        }
    }
  }
} // Flow is having troulbe refining the HintModels so we help it a bit.
// This should be compiled out in the production build.

function refineModel(code, model) {
  return model;
}
function preinitScriptForSSR(href, nonce, crossOrigin) {
  var dispatcher = ReactDOMCurrentDispatcher.current;

  if (dispatcher) {
    dispatcher.preinitScript(href, {
      crossOrigin: getCrossOriginString(crossOrigin),
      nonce: nonce
    });
  }
}

var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function error(format) {
  {
    {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }

      printWarning('error', format, args);
    }
  }
}

function printWarning(level, format, args) {
  // When changing this logic, you might want to also
  // update consoleWithStackDev.www.js as well.
  {
    var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
    var stack = ReactDebugCurrentFrame.getStackAddendum();

    if (stack !== '') {
      format += '%s';
      args = args.concat([stack]);
    } // eslint-disable-next-line react-internal/safe-string-coercion


    var argsWithFormat = args.map(function (item) {
      return String(item);
    }); // Careful: RN currently depends on this prefix

    argsWithFormat.unshift('Warning: ' + format); // We intentionally don't use spread (or .apply) directly because it
    // breaks IE9: https://github.com/facebook/react/issues/13610
    // eslint-disable-next-line react-internal/no-production-logging

    Function.prototype.apply.call(console[level], console, argsWithFormat);
  }
}

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
var REACT_ELEMENT_TYPE = Symbol.for('react.element');
var REACT_PROVIDER_TYPE = Symbol.for('react.provider');
var REACT_SERVER_CONTEXT_TYPE = Symbol.for('react.server_context');
var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
var REACT_MEMO_TYPE = Symbol.for('react.memo');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
var REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED = Symbol.for('react.default_value');
var REACT_POSTPONE_TYPE = Symbol.for('react.postpone');
var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
var FAUX_ITERATOR_SYMBOL = '@@iterator';
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== 'object') {
    return null;
  }

  var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];

  if (typeof maybeIterator === 'function') {
    return maybeIterator;
  }

  return null;
}

var isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

// in case they error.

var jsxPropsParents = new WeakMap();
var jsxChildrenParents = new WeakMap();

function isObjectPrototype(object) {
  if (!object) {
    return false;
  }

  var ObjectPrototype = Object.prototype;

  if (object === ObjectPrototype) {
    return true;
  } // It might be an object from a different Realm which is
  // still just a plain simple object.


  if (Object.getPrototypeOf(object)) {
    return false;
  }

  var names = Object.getOwnPropertyNames(object);

  for (var i = 0; i < names.length; i++) {
    if (!(names[i] in ObjectPrototype)) {
      return false;
    }
  }

  return true;
}

function isSimpleObject(object) {
  if (!isObjectPrototype(Object.getPrototypeOf(object))) {
    return false;
  }

  var names = Object.getOwnPropertyNames(object);

  for (var i = 0; i < names.length; i++) {
    var descriptor = Object.getOwnPropertyDescriptor(object, names[i]);

    if (!descriptor) {
      return false;
    }

    if (!descriptor.enumerable) {
      if ((names[i] === 'key' || names[i] === 'ref') && typeof descriptor.get === 'function') {
        // React adds key and ref getters to props objects to issue warnings.
        // Those getters will not be transferred to the client, but that's ok,
        // so we'll special case them.
        continue;
      }

      return false;
    }
  }

  return true;
}
function objectName(object) {
  // $FlowFixMe[method-unbinding]
  var name = Object.prototype.toString.call(object);
  return name.replace(/^\[object (.*)\]$/, function (m, p0) {
    return p0;
  });
}

function describeKeyForErrorMessage(key) {
  var encodedKey = JSON.stringify(key);
  return '"' + key + '"' === encodedKey ? key : encodedKey;
}

function describeValueForErrorMessage(value) {
  switch (typeof value) {
    case 'string':
      {
        return JSON.stringify(value.length <= 10 ? value : value.slice(0, 10) + '...');
      }

    case 'object':
      {
        if (isArray(value)) {
          return '[...]';
        }

        var name = objectName(value);

        if (name === 'Object') {
          return '{...}';
        }

        return name;
      }

    case 'function':
      return 'function';

    default:
      // eslint-disable-next-line react-internal/safe-string-coercion
      return String(value);
  }
}

function describeElementType(type) {
  if (typeof type === 'string') {
    return type;
  }

  switch (type) {
    case REACT_SUSPENSE_TYPE:
      return 'Suspense';

    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';
  }

  if (typeof type === 'object') {
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        return describeElementType(type.render);

      case REACT_MEMO_TYPE:
        return describeElementType(type.type);

      case REACT_LAZY_TYPE:
        {
          var lazyComponent = type;
          var payload = lazyComponent._payload;
          var init = lazyComponent._init;

          try {
            // Lazy may contain any component type so we recursively resolve it.
            return describeElementType(init(payload));
          } catch (x) {}
        }
    }
  }

  return '';
}

function describeObjectForErrorMessage(objectOrArray, expandedName) {
  var objKind = objectName(objectOrArray);

  if (objKind !== 'Object' && objKind !== 'Array') {
    return objKind;
  }

  var str = '';
  var start = -1;
  var length = 0;

  if (isArray(objectOrArray)) {
    if (jsxChildrenParents.has(objectOrArray)) {
      // Print JSX Children
      var type = jsxChildrenParents.get(objectOrArray);
      str = '<' + describeElementType(type) + '>';
      var array = objectOrArray;

      for (var i = 0; i < array.length; i++) {
        var value = array[i];
        var substr = void 0;

        if (typeof value === 'string') {
          substr = value;
        } else if (typeof value === 'object' && value !== null) {
          substr = '{' + describeObjectForErrorMessage(value) + '}';
        } else {
          substr = '{' + describeValueForErrorMessage(value) + '}';
        }

        if ('' + i === expandedName) {
          start = str.length;
          length = substr.length;
          str += substr;
        } else if (substr.length < 15 && str.length + substr.length < 40) {
          str += substr;
        } else {
          str += '{...}';
        }
      }

      str += '</' + describeElementType(type) + '>';
    } else {
      // Print Array
      str = '[';
      var _array = objectOrArray;

      for (var _i = 0; _i < _array.length; _i++) {
        if (_i > 0) {
          str += ', ';
        }

        var _value = _array[_i];

        var _substr = void 0;

        if (typeof _value === 'object' && _value !== null) {
          _substr = describeObjectForErrorMessage(_value);
        } else {
          _substr = describeValueForErrorMessage(_value);
        }

        if ('' + _i === expandedName) {
          start = str.length;
          length = _substr.length;
          str += _substr;
        } else if (_substr.length < 10 && str.length + _substr.length < 40) {
          str += _substr;
        } else {
          str += '...';
        }
      }

      str += ']';
    }
  } else {
    if (objectOrArray.$$typeof === REACT_ELEMENT_TYPE) {
      str = '<' + describeElementType(objectOrArray.type) + '/>';
    } else if (jsxPropsParents.has(objectOrArray)) {
      // Print JSX
      var _type = jsxPropsParents.get(objectOrArray);

      str = '<' + (describeElementType(_type) || '...');
      var object = objectOrArray;
      var names = Object.keys(object);

      for (var _i2 = 0; _i2 < names.length; _i2++) {
        str += ' ';
        var name = names[_i2];
        str += describeKeyForErrorMessage(name) + '=';
        var _value2 = object[name];

        var _substr2 = void 0;

        if (name === expandedName && typeof _value2 === 'object' && _value2 !== null) {
          _substr2 = describeObjectForErrorMessage(_value2);
        } else {
          _substr2 = describeValueForErrorMessage(_value2);
        }

        if (typeof _value2 !== 'string') {
          _substr2 = '{' + _substr2 + '}';
        }

        if (name === expandedName) {
          start = str.length;
          length = _substr2.length;
          str += _substr2;
        } else if (_substr2.length < 10 && str.length + _substr2.length < 40) {
          str += _substr2;
        } else {
          str += '...';
        }
      }

      str += '>';
    } else {
      // Print Object
      str = '{';
      var _object = objectOrArray;

      var _names = Object.keys(_object);

      for (var _i3 = 0; _i3 < _names.length; _i3++) {
        if (_i3 > 0) {
          str += ', ';
        }

        var _name = _names[_i3];
        str += describeKeyForErrorMessage(_name) + ': ';
        var _value3 = _object[_name];

        var _substr3 = void 0;

        if (typeof _value3 === 'object' && _value3 !== null) {
          _substr3 = describeObjectForErrorMessage(_value3);
        } else {
          _substr3 = describeValueForErrorMessage(_value3);
        }

        if (_name === expandedName) {
          start = str.length;
          length = _substr3.length;
          str += _substr3;
        } else if (_substr3.length < 10 && str.length + _substr3.length < 40) {
          str += _substr3;
        } else {
          str += '...';
        }
      }

      str += '}';
    }
  }

  if (expandedName === undefined) {
    return str;
  }

  if (start > -1 && length > 0) {
    var highlight = ' '.repeat(start) + '^'.repeat(length);
    return '\n  ' + str + '\n  ' + highlight;
  }

  return '\n  ' + str;
}

var knownServerReferences = new WeakMap(); // Serializable values
// Thenable<ReactServerValue>
// function serializeByValueID(id: number): string {
//   return '$' + id.toString(16);
// }

function serializePromiseID(id) {
  return '$@' + id.toString(16);
}

function serializeServerReferenceID(id) {
  return '$F' + id.toString(16);
}

function serializeSymbolReference(name) {
  return '$S' + name;
}

function serializeFormDataReference(id) {
  // Why K? F is "Function". D is "Date". What else?
  return '$K' + id.toString(16);
}

function serializeNumber(number) {
  if (Number.isFinite(number)) {
    if (number === 0 && 1 / number === -Infinity) {
      return '$-0';
    } else {
      return number;
    }
  } else {
    if (number === Infinity) {
      return '$Infinity';
    } else if (number === -Infinity) {
      return '$-Infinity';
    } else {
      return '$NaN';
    }
  }
}

function serializeUndefined() {
  return '$undefined';
}

function serializeDateFromDateJSON(dateJSON) {
  // JSON.stringify automatically calls Date.prototype.toJSON which calls toISOString.
  // We need only tack on a $D prefix.
  return '$D' + dateJSON;
}

function serializeBigInt(n) {
  return '$n' + n.toString(10);
}

function serializeMapID(id) {
  return '$Q' + id.toString(16);
}

function serializeSetID(id) {
  return '$W' + id.toString(16);
}

function escapeStringValue(value) {
  if (value[0] === '$') {
    // We need to escape $ prefixed strings since we use those to encode
    // references to IDs and as special symbol values.
    return '$' + value;
  } else {
    return value;
  }
}

function processReply(root, formFieldPrefix, resolve, reject) {
  var nextPartId = 1;
  var pendingParts = 0;
  var formData = null;

  function resolveToJSON(key, value) {
    var parent = this; // Make sure that `parent[key]` wasn't JSONified before `value` was passed to us

    {
      // $FlowFixMe[incompatible-use]
      var originalValue = parent[key];

      if (typeof originalValue === 'object' && originalValue !== value && !(originalValue instanceof Date)) {
        if (objectName(originalValue) !== 'Object') {
          error('Only plain objects can be passed to Server Functions from the Client. ' + '%s objects are not supported.%s', objectName(originalValue), describeObjectForErrorMessage(parent, key));
        } else {
          error('Only plain objects can be passed to Server Functions from the Client. ' + 'Objects with toJSON methods are not supported. Convert it manually ' + 'to a simple value before passing it to props.%s', describeObjectForErrorMessage(parent, key));
        }
      }
    }

    if (value === null) {
      return null;
    }

    if (typeof value === 'object') {
      // $FlowFixMe[method-unbinding]
      if (typeof value.then === 'function') {
        // We assume that any object with a .then property is a "Thenable" type,
        // or a Promise type. Either of which can be represented by a Promise.
        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        }

        pendingParts++;
        var promiseId = nextPartId++;
        var thenable = value;
        thenable.then(function (partValue) {
          var partJSON = JSON.stringify(partValue, resolveToJSON); // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.

          var data = formData; // eslint-disable-next-line react-internal/safe-string-coercion

          data.append(formFieldPrefix + promiseId, partJSON);
          pendingParts--;

          if (pendingParts === 0) {
            resolve(data);
          }
        }, function (reason) {
          // In the future we could consider serializing this as an error
          // that throws on the server instead.
          reject(reason);
        });
        return serializePromiseID(promiseId);
      } // TODO: Should we the Object.prototype.toString.call() to test for cross-realm objects?


      if (value instanceof FormData) {
        if (formData === null) {
          // Upgrade to use FormData to allow us to use rich objects as its values.
          formData = new FormData();
        }

        var data = formData;
        var refId = nextPartId++; // Copy all the form fields with a prefix for this reference.
        // These must come first in the form order because we assume that all the
        // fields are available before this is referenced.

        var prefix = formFieldPrefix + refId + '_'; // $FlowFixMe[prop-missing]: FormData has forEach.

        value.forEach(function (originalValue, originalKey) {
          data.append(prefix + originalKey, originalValue);
        });
        return serializeFormDataReference(refId);
      }

      if (value instanceof Map) {
        var partJSON = JSON.stringify(Array.from(value), resolveToJSON);

        if (formData === null) {
          formData = new FormData();
        }

        var mapId = nextPartId++;
        formData.append(formFieldPrefix + mapId, partJSON);
        return serializeMapID(mapId);
      }

      if (value instanceof Set) {
        var _partJSON = JSON.stringify(Array.from(value), resolveToJSON);

        if (formData === null) {
          formData = new FormData();
        }

        var setId = nextPartId++;
        formData.append(formFieldPrefix + setId, _partJSON);
        return serializeSetID(setId);
      }

      if (!isArray(value)) {
        var iteratorFn = getIteratorFn(value);

        if (iteratorFn) {
          return Array.from(value);
        }
      }

      {
        if (value !== null && !isArray(value)) {
          // Verify that this is a simple plain object.
          if (value.$$typeof === REACT_ELEMENT_TYPE) {
            error('React Element cannot be passed to Server Functions from the Client.%s', describeObjectForErrorMessage(parent, key));
          } else if (value.$$typeof === REACT_LAZY_TYPE) {
            error('React Lazy cannot be passed to Server Functions from the Client.%s', describeObjectForErrorMessage(parent, key));
          } else if (value.$$typeof === REACT_PROVIDER_TYPE) {
            error('React Context Providers cannot be passed to Server Functions from the Client.%s', describeObjectForErrorMessage(parent, key));
          } else if (objectName(value) !== 'Object') {
            error('Only plain objects can be passed to Client Components from Server Components. ' + '%s objects are not supported.%s', objectName(value), describeObjectForErrorMessage(parent, key));
          } else if (!isSimpleObject(value)) {
            error('Only plain objects can be passed to Client Components from Server Components. ' + 'Classes or other objects with methods are not supported.%s', describeObjectForErrorMessage(parent, key));
          } else if (Object.getOwnPropertySymbols) {
            var symbols = Object.getOwnPropertySymbols(value);

            if (symbols.length > 0) {
              error('Only plain objects can be passed to Client Components from Server Components. ' + 'Objects with symbol properties like %s are not supported.%s', symbols[0].description, describeObjectForErrorMessage(parent, key));
            }
          }
        }
      } // $FlowFixMe[incompatible-return]


      return value;
    }

    if (typeof value === 'string') {
      // TODO: Maybe too clever. If we support URL there's no similar trick.
      if (value[value.length - 1] === 'Z') {
        // Possibly a Date, whose toJSON automatically calls toISOString
        // $FlowFixMe[incompatible-use]
        var _originalValue = parent[key];

        if (_originalValue instanceof Date) {
          return serializeDateFromDateJSON(value);
        }
      }

      return escapeStringValue(value);
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return serializeNumber(value);
    }

    if (typeof value === 'undefined') {
      return serializeUndefined();
    }

    if (typeof value === 'function') {
      var metaData = knownServerReferences.get(value);

      if (metaData !== undefined) {
        var metaDataJSON = JSON.stringify(metaData, resolveToJSON);

        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        } // The reference to this function came from the same client so we can pass it back.


        var _refId = nextPartId++; // eslint-disable-next-line react-internal/safe-string-coercion


        formData.set(formFieldPrefix + _refId, metaDataJSON);
        return serializeServerReferenceID(_refId);
      }

      throw new Error('Client Functions cannot be passed directly to Server Functions. ' + 'Only Functions passed from the Server can be passed back again.');
    }

    if (typeof value === 'symbol') {
      // $FlowFixMe[incompatible-type] `description` might be undefined
      var name = value.description;

      if (Symbol.for(name) !== value) {
        throw new Error('Only global symbols received from Symbol.for(...) can be passed to Server Functions. ' + ("The symbol Symbol.for(" + // $FlowFixMe[incompatible-type] `description` might be undefined
        value.description + ") cannot be found among global symbols."));
      }

      return serializeSymbolReference(name);
    }

    if (typeof value === 'bigint') {
      return serializeBigInt(value);
    }

    throw new Error("Type " + typeof value + " is not supported as an argument to a Server Function.");
  } // $FlowFixMe[incompatible-type] it's not going to be undefined because we'll encode it.


  var json = JSON.stringify(root, resolveToJSON);

  if (formData === null) {
    // If it's a simple data structure, we just use plain JSON.
    resolve(json);
  } else {
    // Otherwise, we use FormData to let us stream in the result.
    formData.set(formFieldPrefix + '0', json);

    if (pendingParts === 0) {
      // $FlowFixMe[incompatible-call] this has already been refined.
      resolve(formData);
    }
  }
}
var boundCache = new WeakMap();

function encodeFormData(reference) {
  var resolve, reject; // We need to have a handle on the thenable so that we can synchronously set
  // its status from processReply, when it can complete synchronously.

  var thenable = new Promise(function (res, rej) {
    resolve = res;
    reject = rej;
  });
  processReply(reference, '', function (body) {
    if (typeof body === 'string') {
      var data = new FormData();
      data.append('0', body);
      body = data;
    }

    var fulfilled = thenable;
    fulfilled.status = 'fulfilled';
    fulfilled.value = body;
    resolve(body);
  }, function (e) {
    var rejected = thenable;
    rejected.status = 'rejected';
    rejected.reason = e;
    reject(e);
  });
  return thenable;
}

function encodeFormAction(identifierPrefix) {
  var reference = knownServerReferences.get(this);

  if (!reference) {
    throw new Error('Tried to encode a Server Action from a different instance than the encoder is from. ' + 'This is a bug in React.');
  }

  var data = null;
  var name;
  var boundPromise = reference.bound;

  if (boundPromise !== null) {
    var thenable = boundCache.get(reference);

    if (!thenable) {
      thenable = encodeFormData(reference);
      boundCache.set(reference, thenable);
    }

    if (thenable.status === 'rejected') {
      throw thenable.reason;
    } else if (thenable.status !== 'fulfilled') {
      throw thenable;
    }

    var encodedFormData = thenable.value; // This is hacky but we need the identifier prefix to be added to
    // all fields but the suspense cache would break since we might get
    // a new identifier each time. So we just append it at the end instead.

    var prefixedData = new FormData(); // $FlowFixMe[prop-missing]

    encodedFormData.forEach(function (value, key) {
      prefixedData.append('$ACTION_' + identifierPrefix + ':' + key, value);
    });
    data = prefixedData; // We encode the name of the prefix containing the data.

    name = '$ACTION_REF_' + identifierPrefix;
  } else {
    // This is the simple case so we can just encode the ID.
    name = '$ACTION_ID_' + reference.id;
  }

  return {
    name: name,
    method: 'POST',
    encType: 'multipart/form-data',
    data: data
  };
}

function isSignatureEqual(referenceId, numberOfBoundArgs) {
  var reference = knownServerReferences.get(this);

  if (!reference) {
    throw new Error('Tried to encode a Server Action from a different instance than the encoder is from. ' + 'This is a bug in React.');
  }

  if (reference.id !== referenceId) {
    // These are different functions.
    return false;
  } // Now check if the number of bound arguments is the same.


  var boundPromise = reference.bound;

  if (boundPromise === null) {
    // No bound arguments.
    return numberOfBoundArgs === 0;
  } // Unwrap the bound arguments array by suspending, if necessary. As with
  // encodeFormData, this means isSignatureEqual can only be called while React
  // is rendering.


  switch (boundPromise.status) {
    case 'fulfilled':
      {
        var boundArgs = boundPromise.value;
        return boundArgs.length === numberOfBoundArgs;
      }

    case 'pending':
      {
        throw boundPromise;
      }

    case 'rejected':
      {
        throw boundPromise.reason;
      }

    default:
      {
        if (typeof boundPromise.status === 'string') ; else {
          var pendingThenable = boundPromise;
          pendingThenable.status = 'pending';
          pendingThenable.then(function (boundArgs) {
            var fulfilledThenable = boundPromise;
            fulfilledThenable.status = 'fulfilled';
            fulfilledThenable.value = boundArgs;
          }, function (error) {
            var rejectedThenable = boundPromise;
            rejectedThenable.status = 'rejected';
            rejectedThenable.reason = error;
          });
        }

        throw boundPromise;
      }
  }
}

function registerServerReference(proxy, reference) {
  // Expose encoder for use by SSR, as well as a special bind that can be used to
  // keep server capabilities.
  {
    // Only expose this in builds that would actually use it. Not needed on the client.
    Object.defineProperties(proxy, {
      $$FORM_ACTION: {
        value: encodeFormAction
      },
      $$IS_SIGNATURE_EQUAL: {
        value: isSignatureEqual
      },
      bind: {
        value: bind
      }
    });
  }

  knownServerReferences.set(proxy, reference);
} // $FlowFixMe[method-unbinding]

var FunctionBind = Function.prototype.bind; // $FlowFixMe[method-unbinding]

var ArraySlice = Array.prototype.slice;

function bind() {
  // $FlowFixMe[unsupported-syntax]
  var newFn = FunctionBind.apply(this, arguments);
  var reference = knownServerReferences.get(this);

  if (reference) {
    var args = ArraySlice.call(arguments, 1);
    var boundPromise = null;

    if (reference.bound !== null) {
      boundPromise = Promise.resolve(reference.bound).then(function (boundArgs) {
        return boundArgs.concat(args);
      });
    } else {
      boundPromise = Promise.resolve(args);
    }

    registerServerReference(newFn, {
      id: reference.id,
      bound: boundPromise
    });
  }

  return newFn;
}

function createServerReference$1(id, callServer) {
  var proxy = function () {
    // $FlowFixMe[method-unbinding]
    var args = Array.prototype.slice.call(arguments);
    return callServer(id, args);
  };

  registerServerReference(proxy, {
    id: id,
    bound: null
  });
  return proxy;
}

var ContextRegistry = ReactSharedInternals.ContextRegistry;
function getOrCreateServerContext(globalName) {
  if (!ContextRegistry[globalName]) {
    var context = {
      $$typeof: REACT_SERVER_CONTEXT_TYPE,
      // As a workaround to support multiple concurrent renderers, we categorize
      // some renderers as primary and others as secondary. We only expect
      // there to be two concurrent renderers at most: React Native (primary) and
      // Fabric (secondary); React DOM (primary) and React ART (secondary).
      // Secondary renderers store their context values on separate fields.
      _currentValue: REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED,
      _currentValue2: REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED,
      _defaultValue: REACT_SERVER_CONTEXT_DEFAULT_VALUE_NOT_LOADED,
      // Used to track how many concurrent renderers this context currently
      // supports within in a single renderer. Such as parallel server rendering.
      _threadCount: 0,
      // These are circular
      Provider: null,
      Consumer: null,
      _globalName: globalName
    };
    context.Provider = {
      $$typeof: REACT_PROVIDER_TYPE,
      _context: context
    };

    {
      var hasWarnedAboutUsingConsumer;
      context._currentRenderer = null;
      context._currentRenderer2 = null;
      Object.defineProperties(context, {
        Consumer: {
          get: function () {
            if (!hasWarnedAboutUsingConsumer) {
              error('Consumer pattern is not supported by ReactServerContext');

              hasWarnedAboutUsingConsumer = true;
            }

            return null;
          }
        }
      });
    }

    ContextRegistry[globalName] = context;
  }

  return ContextRegistry[globalName];
}

var ROW_ID = 0;
var ROW_TAG = 1;
var ROW_LENGTH = 2;
var ROW_CHUNK_BY_NEWLINE = 3;
var ROW_CHUNK_BY_LENGTH = 4;
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

function createInitializedTextChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(INITIALIZED, value, null, response);
}

function createInitializedBufferChunk(response, value) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(INITIALIZED, value, null, response);
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

  registerServerReference(proxy, metaData);
  return proxy;
}

function getOutlinedModel(response, id) {
  var chunk = getChunk(response, id);

  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
      break;
  } // The status might have changed after initialization.


  switch (chunk.status) {
    case INITIALIZED:
      {
        return chunk.value;
      }
    // We always encode it first in the stream so it won't be pending.

    default:
      throw chunk.reason;
  }
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
          return value.slice(1);
        }

      case 'L':
        {
          // Lazy node
          var id = parseInt(value.slice(2), 16);
          var chunk = getChunk(response, id); // We create a React.lazy wrapper around any lazy values.
          // When passed into React, we'll know how to suspend on this.

          return createLazyChunkWrapper(chunk);
        }

      case '@':
        {
          // Promise
          var _id = parseInt(value.slice(2), 16);

          var _chunk = getChunk(response, _id);

          return _chunk;
        }

      case 'S':
        {
          // Symbol
          return Symbol.for(value.slice(2));
        }

      case 'P':
        {
          // Server Context Provider
          return getOrCreateServerContext(value.slice(2)).Provider;
        }

      case 'F':
        {
          // Server Reference
          var _id2 = parseInt(value.slice(2), 16);

          var metadata = getOutlinedModel(response, _id2);
          return createServerReferenceProxy(response, metadata);
        }

      case 'Q':
        {
          // Map
          var _id3 = parseInt(value.slice(2), 16);

          var data = getOutlinedModel(response, _id3);
          return new Map(data);
        }

      case 'W':
        {
          // Set
          var _id4 = parseInt(value.slice(2), 16);

          var _data = getOutlinedModel(response, _id4);

          return new Set(_data);
        }

      case 'I':
        {
          // $Infinity
          return Infinity;
        }

      case '-':
        {
          // $-0 or $-Infinity
          if (value === '$-0') {
            return -0;
          } else {
            return -Infinity;
          }
        }

      case 'N':
        {
          // $NaN
          return NaN;
        }

      case 'u':
        {
          // matches "$undefined"
          // Special encoding for `undefined` which can't be serialized as JSON otherwise.
          return undefined;
        }

      case 'D':
        {
          // Date
          return new Date(Date.parse(value.slice(2)));
        }

      case 'n':
        {
          // BigInt
          return BigInt(value.slice(2));
        }

      default:
        {
          // We assume that anything else is a reference ID.
          var _id5 = parseInt(value.slice(1), 16);

          var _chunk2 = getChunk(response, _id5);

          switch (_chunk2.status) {
            case RESOLVED_MODEL:
              initializeModelChunk(_chunk2);
              break;

            case RESOLVED_MODULE:
              initializeModuleChunk(_chunk2);
              break;
          } // The status might have changed after initialization.


          switch (_chunk2.status) {
            case INITIALIZED:
              return _chunk2.value;

            case PENDING:
            case BLOCKED:
              var parentChunk = initializingChunk;

              _chunk2.then(createModelResolver(parentChunk, parentObject, key), createModelReject(parentChunk));

              return null;

            default:
              throw _chunk2.reason;
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

function createResponse(bundlerConfig, moduleLoading, callServer, nonce) {
  var chunks = new Map();
  var response = {
    _bundlerConfig: bundlerConfig,
    _moduleLoading: moduleLoading,
    _callServer: callServer !== undefined ? callServer : missingCall,
    _nonce: nonce,
    _chunks: chunks,
    _stringDecoder: createStringDecoder(),
    _fromJSON: null,
    _rowState: 0,
    _rowID: 0,
    _rowTag: 0,
    _rowLength: 0,
    _buffer: []
  }; // Don't inline this call because it causes closure to outline the call above.

  response._fromJSON = createFromJSONCallback(response);
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

function resolveText(response, id, text) {
  var chunks = response._chunks; // We assume that we always reference large strings after they've been
  // emitted.

  chunks.set(id, createInitializedTextChunk(response, text));
}

function resolveBuffer(response, id, buffer) {
  var chunks = response._chunks; // We assume that we always reference buffers after they've been emitted.

  chunks.set(id, createInitializedBufferChunk(response, buffer));
}

function resolveModule(response, id, model) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);
  var clientReferenceMetadata = parseModel(response, model);
  var clientReference = resolveClientReference(response._bundlerConfig, clientReferenceMetadata);
  prepareDestinationForModule(response._moduleLoading, response._nonce, clientReferenceMetadata); // TODO: Add an option to encode modules that are lazy loaded.
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

function resolvePostponeDev(response, id, reason, stack) {


  var error = new Error(reason || '');
  var postponeInstance = error;
  postponeInstance.$$typeof = REACT_POSTPONE_TYPE;
  postponeInstance.stack = stack;
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunks.set(id, createErrorChunk(response, postponeInstance));
  } else {
    triggerErrorOnChunk(chunk, postponeInstance);
  }
}

function resolveHint(response, code, model) {
  var hintModel = parseModel(response, model);
  dispatchHint(code, hintModel);
}

function mergeBuffer(buffer, lastChunk) {
  var l = buffer.length; // Count the bytes we'll need

  var byteLength = lastChunk.length;

  for (var i = 0; i < l; i++) {
    byteLength += buffer[i].byteLength;
  } // Allocate enough contiguous space


  var result = new Uint8Array(byteLength);
  var offset = 0; // Copy all the buffers into it.

  for (var _i = 0; _i < l; _i++) {
    var chunk = buffer[_i];
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  result.set(lastChunk, offset);
  return result;
}

function resolveTypedArray(response, id, buffer, lastChunk, constructor, bytesPerElement) {
  // If the view fits into one original buffer, we just reuse that buffer instead of
  // copying it out to a separate copy. This means that it's not always possible to
  // transfer these values to other threads without copying first since they may
  // share array buffer. For this to work, it must also have bytes aligned to a
  // multiple of a size of the type.
  var chunk = buffer.length === 0 && lastChunk.byteOffset % bytesPerElement === 0 ? lastChunk : mergeBuffer(buffer, lastChunk); // TODO: The transfer protocol of RSC is little-endian. If the client isn't little-endian
  // we should convert it instead. In practice big endian isn't really Web compatible so it's
  // somewhat safe to assume that browsers aren't going to run it, but maybe there's some SSR
  // server that's affected.

  var view = new constructor(chunk.buffer, chunk.byteOffset, chunk.byteLength / bytesPerElement);
  resolveBuffer(response, id, view);
}

function processFullRow(response, id, tag, buffer, chunk) {
  {
    switch (tag) {
      case 65
      /* "A" */
      :
        // We must always clone to extract it into a separate buffer instead of just a view.
        resolveBuffer(response, id, mergeBuffer(buffer, chunk).buffer);
        return;

      case 67
      /* "C" */
      :
        resolveTypedArray(response, id, buffer, chunk, Int8Array, 1);
        return;

      case 99
      /* "c" */
      :
        resolveBuffer(response, id, buffer.length === 0 ? chunk : mergeBuffer(buffer, chunk));
        return;

      case 85
      /* "U" */
      :
        resolveTypedArray(response, id, buffer, chunk, Uint8ClampedArray, 1);
        return;

      case 83
      /* "S" */
      :
        resolveTypedArray(response, id, buffer, chunk, Int16Array, 2);
        return;

      case 115
      /* "s" */
      :
        resolveTypedArray(response, id, buffer, chunk, Uint16Array, 2);
        return;

      case 76
      /* "L" */
      :
        resolveTypedArray(response, id, buffer, chunk, Int32Array, 4);
        return;

      case 108
      /* "l" */
      :
        resolveTypedArray(response, id, buffer, chunk, Uint32Array, 4);
        return;

      case 70
      /* "F" */
      :
        resolveTypedArray(response, id, buffer, chunk, Float32Array, 4);
        return;

      case 68
      /* "D" */
      :
        resolveTypedArray(response, id, buffer, chunk, Float64Array, 8);
        return;

      case 78
      /* "N" */
      :
        resolveTypedArray(response, id, buffer, chunk, BigInt64Array, 8);
        return;

      case 109
      /* "m" */
      :
        resolveTypedArray(response, id, buffer, chunk, BigUint64Array, 8);
        return;

      case 86
      /* "V" */
      :
        resolveTypedArray(response, id, buffer, chunk, DataView, 1);
        return;
    }
  }

  var stringDecoder = response._stringDecoder;
  var row = '';

  for (var i = 0; i < buffer.length; i++) {
    row += readPartialStringChunk(stringDecoder, buffer[i]);
  }

  row += readFinalStringChunk(stringDecoder, chunk);

  switch (tag) {
    case 73
    /* "I" */
    :
      {
        resolveModule(response, id, row);
        return;
      }

    case 72
    /* "H" */
    :
      {
        var code = row[0];
        resolveHint(response, code, row.slice(1));
        return;
      }

    case 69
    /* "E" */
    :
      {
        var errorInfo = JSON.parse(row);

        {
          resolveErrorDev(response, id, errorInfo.digest, errorInfo.message, errorInfo.stack);
        }

        return;
      }

    case 84
    /* "T" */
    :
      {
        resolveText(response, id, row);
        return;
      }

    case 80
    /* "P" */
    :
      {
        {
          {
            var postponeInfo = JSON.parse(row);
            resolvePostponeDev(response, id, postponeInfo.reason, postponeInfo.stack);
          }

          return;
        }
      }
    // Fallthrough

    default:
      /* """ "{" "[" "t" "f" "n" "0" - "9" */
      {
        // We assume anything else is JSON.
        resolveModel(response, id, row);
        return;
      }
  }
}

function processBinaryChunk(response, chunk) {
  var i = 0;
  var rowState = response._rowState;
  var rowID = response._rowID;
  var rowTag = response._rowTag;
  var rowLength = response._rowLength;
  var buffer = response._buffer;
  var chunkLength = chunk.length;

  while (i < chunkLength) {
    var lastIdx = -1;

    switch (rowState) {
      case ROW_ID:
        {
          var byte = chunk[i++];

          if (byte === 58
          /* ":" */
          ) {
              // Finished the rowID, next we'll parse the tag.
              rowState = ROW_TAG;
            } else {
            rowID = rowID << 4 | (byte > 96 ? byte - 87 : byte - 48);
          }

          continue;
        }

      case ROW_TAG:
        {
          var resolvedRowTag = chunk[i];

          if (resolvedRowTag === 84
          /* "T" */
          || (resolvedRowTag === 65
          /* "A" */
          || resolvedRowTag === 67
          /* "C" */
          || resolvedRowTag === 99
          /* "c" */
          || resolvedRowTag === 85
          /* "U" */
          || resolvedRowTag === 83
          /* "S" */
          || resolvedRowTag === 115
          /* "s" */
          || resolvedRowTag === 76
          /* "L" */
          || resolvedRowTag === 108
          /* "l" */
          || resolvedRowTag === 70
          /* "F" */
          || resolvedRowTag === 68
          /* "D" */
          || resolvedRowTag === 78
          /* "N" */
          || resolvedRowTag === 109
          /* "m" */
          || resolvedRowTag === 86)
          /* "V" */
          ) {
              rowTag = resolvedRowTag;
              rowState = ROW_LENGTH;
              i++;
            } else if (resolvedRowTag > 64 && resolvedRowTag < 91
          /* "A"-"Z" */
          ) {
              rowTag = resolvedRowTag;
              rowState = ROW_CHUNK_BY_NEWLINE;
              i++;
            } else {
            rowTag = 0;
            rowState = ROW_CHUNK_BY_NEWLINE; // This was an unknown tag so it was probably part of the data.
          }

          continue;
        }

      case ROW_LENGTH:
        {
          var _byte = chunk[i++];

          if (_byte === 44
          /* "," */
          ) {
              // Finished the rowLength, next we'll buffer up to that length.
              rowState = ROW_CHUNK_BY_LENGTH;
            } else {
            rowLength = rowLength << 4 | (_byte > 96 ? _byte - 87 : _byte - 48);
          }

          continue;
        }

      case ROW_CHUNK_BY_NEWLINE:
        {
          // We're looking for a newline
          lastIdx = chunk.indexOf(10
          /* "\n" */
          , i);
          break;
        }

      case ROW_CHUNK_BY_LENGTH:
        {
          // We're looking for the remaining byte length
          lastIdx = i + rowLength;

          if (lastIdx > chunk.length) {
            lastIdx = -1;
          }

          break;
        }
    }

    var offset = chunk.byteOffset + i;

    if (lastIdx > -1) {
      // We found the last chunk of the row
      var length = lastIdx - i;
      var lastChunk = new Uint8Array(chunk.buffer, offset, length);
      processFullRow(response, rowID, rowTag, buffer, lastChunk); // Reset state machine for a new row

      i = lastIdx;

      if (rowState === ROW_CHUNK_BY_NEWLINE) {
        // If we're trailing by a newline we need to skip it.
        i++;
      }

      rowState = ROW_ID;
      rowTag = 0;
      rowID = 0;
      rowLength = 0;
      buffer.length = 0;
    } else {
      // The rest of this row is in a future chunk. We stash the rest of the
      // current chunk until we can process the full row.
      var _length = chunk.byteLength - i;

      var remainingSlice = new Uint8Array(chunk.buffer, offset, _length);
      buffer.push(remainingSlice); // Update how many bytes we're still waiting for. If we're looking for
      // a newline, this doesn't hurt since we'll just ignore it.

      rowLength -= remainingSlice.byteLength;
      break;
    }
  }

  response._rowState = rowState;
  response._rowID = rowID;
  response._rowTag = rowTag;
  response._rowLength = rowLength;
}

function parseModel(response, json) {
  return JSON.parse(json, response._fromJSON);
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

function close(response) {
  // In case there are any remaining unresolved chunks, they won't
  // be resolved now. So we need to issue an error to those.
  // Ideally we should be able to early bail out if we kept a
  // ref count of pending chunks.
  reportGlobalError(response, new Error('Connection closed.'));
}

function noServerCall() {
  throw new Error('Server Functions cannot be called during initial render. ' + 'This would create a fetch waterfall. Try to use a Server Component ' + 'to pass data to Client Components instead.');
}

function createServerReference(id, callServer) {
  return createServerReference$1(id, noServerCall);
}

function createFromNodeStream(stream, ssrManifest, options) {
  var response = createResponse(ssrManifest.moduleMap, ssrManifest.moduleLoading, noServerCall, options && typeof options.nonce === 'string' ? options.nonce : undefined);
  stream.on('data', function (chunk) {
    processBinaryChunk(response, chunk);
  });
  stream.on('error', function (error) {
    reportGlobalError(response, error);
  });
  stream.on('end', function () {
    return close(response);
  });
  return getRoot(response);
}

exports.createFromNodeStream = createFromNodeStream;
exports.createServerReference = createServerReference;
  })();
}
