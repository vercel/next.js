/**
 * @license React
 * react-server-dom-webpack-client.node.unbundled.development.js
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

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

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

// This flips color using ANSI, then sets a color styling, then resets.
var badgeFormat = '\x1b[0m\x1b[7m%c%s\x1b[0m%c '; // Same badge styling as DevTools.

var badgeStyle = // We use a fixed background if light-dark is not supported, otherwise
// we use a transparent background.
'background: #e6e6e6;' + 'background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));' + 'color: #000000;' + 'color: light-dark(#000000, #ffffff);' + 'border-radius: 2px';
var resetStyle = '';
var pad = ' ';
function printToConsole(methodName, args, badgeName) {
  var offset = 0;

  switch (methodName) {
    case 'dir':
    case 'dirxml':
    case 'groupEnd':
    case 'table':
      {
        // These methods cannot be colorized because they don't take a formatting string.
        // eslint-disable-next-line react-internal/no-production-logging
        console[methodName].apply(console, args);
        return;
      }

    case 'assert':
      {
        // assert takes formatting options as the second argument.
        offset = 1;
      }
  }

  var newArgs = args.slice(0);

  if (typeof newArgs[offset] === 'string') {
    newArgs.splice(offset, 1, badgeFormat + newArgs[offset], badgeStyle, pad + badgeName + pad, resetStyle);
  } else {
    newArgs.splice(offset, 0, badgeFormat, badgeStyle, pad + badgeName + pad, resetStyle);
  } // eslint-disable-next-line react-internal/no-production-logging


  console[methodName].apply(console, newArgs);
  return;
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

  return {
    specifier: resolvedModuleData.specifier,
    name: name,
    async: isAsyncImport(metadata)
  };
}
var asyncModuleCache = new Map();
function preloadModule(metadata) {
  var existingPromise = asyncModuleCache.get(metadata.specifier);

  if (existingPromise) {
    if (existingPromise.status === 'fulfilled') {
      return null;
    }

    return existingPromise;
  } else {
    // $FlowFixMe[unsupported-syntax]
    var modulePromise = import(metadata.specifier);

    if (metadata.async) {
      // If the module is async, it must have been a CJS module.
      // CJS modules are accessed through the default export in
      // Node.js so we have to get the default export to get the
      // full module exports.
      modulePromise = modulePromise.then(function (value) {
        return value.default;
      });
    }

    modulePromise.then(function (value) {
      var fulfilledThenable = modulePromise;
      fulfilledThenable.status = 'fulfilled';
      fulfilledThenable.value = value;
    }, function (reason) {
      var rejectedThenable = modulePromise;
      rejectedThenable.status = 'rejected';
      rejectedThenable.reason = reason;
    });
    asyncModuleCache.set(metadata.specifier, modulePromise);
    return modulePromise;
  }
}
function requireModule(metadata) {
  var moduleExports; // We assume that preloadModule has been called before, which
  // should have added something to the module cache.

  var promise = asyncModuleCache.get(metadata.specifier);

  if (promise.status === 'fulfilled') {
    moduleExports = promise.value;
  } else {
    throw promise.reason;
  }

  if (metadata.name === '*') {
    // This is a placeholder value that represents that the caller imported this
    // as a CommonJS module as is.
    return moduleExports;
  }

  if (metadata.name === '') {
    // This is a placeholder value that represents that the caller accessed the
    // default property of this if it was an ESM interop module.
    return moduleExports.default;
  }

  return moduleExports[metadata.name];
}

function prepareDestinationWithChunks(moduleLoading, // Chunks are double-indexed [..., idx, filenamex, idy, filenamey, ...]
chunks, nonce) {
  if (moduleLoading !== null) {
    for (var i = 1; i < chunks.length; i += 2) {
      preinitScriptForSSR(moduleLoading.prefix + chunks[i], nonce, moduleLoading.crossOrigin);
    }
  }
}

var ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function getCrossOriginString(input) {
  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}

// This client file is in the shared folder because it applies to both SSR and browser contexts.
function dispatchHint(code, model) {
  var dispatcher = ReactDOMSharedInternals.d;
  /* ReactDOMCurrentDispatcher */

  switch (code) {
    case 'D':
      {
        var refined = refineModel(code, model);
        var href = refined;
        dispatcher.D(
        /* prefetchDNS */
        href);
        return;
      }

    case 'C':
      {
        var _refined = refineModel(code, model);

        if (typeof _refined === 'string') {
          var _href = _refined;
          dispatcher.C(
          /* preconnect */
          _href);
        } else {
          var _href2 = _refined[0];
          var crossOrigin = _refined[1];
          dispatcher.C(
          /* preconnect */
          _href2, crossOrigin);
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
          dispatcher.L(
          /* preload */
          _href3, as, options);
        } else {
          dispatcher.L(
          /* preload */
          _href3, as);
        }

        return;
      }

    case 'm':
      {
        var _refined3 = refineModel(code, model);

        if (typeof _refined3 === 'string') {
          var _href4 = _refined3;
          dispatcher.m(
          /* preloadModule */
          _href4);
        } else {
          var _href5 = _refined3[0];
          var _options = _refined3[1];
          dispatcher.m(
          /* preloadModule */
          _href5, _options);
        }

        return;
      }

    case 'X':
      {
        var _refined4 = refineModel(code, model);

        if (typeof _refined4 === 'string') {
          var _href6 = _refined4;
          dispatcher.X(
          /* preinitScript */
          _href6);
        } else {
          var _href7 = _refined4[0];
          var _options2 = _refined4[1];
          dispatcher.X(
          /* preinitScript */
          _href7, _options2);
        }

        return;
      }

    case 'S':
      {
        var _refined5 = refineModel(code, model);

        if (typeof _refined5 === 'string') {
          var _href8 = _refined5;
          dispatcher.S(
          /* preinitStyle */
          _href8);
        } else {
          var _href9 = _refined5[0];
          var precedence = _refined5[1] === 0 ? undefined : _refined5[1];

          var _options3 = _refined5.length === 3 ? _refined5[2] : undefined;

          dispatcher.S(
          /* preinitStyle */
          _href9, precedence, _options3);
        }

        return;
      }

    case 'M':
      {
        var _refined6 = refineModel(code, model);

        if (typeof _refined6 === 'string') {
          var _href10 = _refined6;
          dispatcher.M(
          /* preinitModuleScript */
          _href10);
        } else {
          var _href11 = _refined6[0];
          var _options4 = _refined6[1];
          dispatcher.M(
          /* preinitModuleScript */
          _href11, _options4);
        }

        return;
      }
  }
} // Flow is having trouble refining the HintModels so we help it a bit.
// This should be compiled out in the production build.

function refineModel(code, model) {
  return model;
}
function preinitScriptForSSR(href, nonce, crossOrigin) {
  ReactDOMSharedInternals.d
  /* ReactDOMCurrentDispatcher */
  .X(
  /* preinitScript */
  href, {
    crossOrigin: getCrossOriginString(crossOrigin),
    nonce: nonce
  });
}

var ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function error(format) {
  {
    {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }

      printWarning('error', format, args, new Error('react-stack-top-frame'));
    }
  }
} // eslint-disable-next-line react-internal/no-production-logging

function printWarning(level, format, args, currentStack) {
  // When changing this logic, you might want to also
  // update consoleWithStackDev.www.js as well.
  {
    var isErrorLogger = format === '%s\n\n%s\n' || format === '%o\n\n%s\n\n%s\n';

    if (ReactSharedInternals.getCurrentStack) {
      // We only add the current stack to the console when createTask is not supported.
      // Since createTask requires DevTools to be open to work, this means that stacks
      // can be lost while DevTools isn't open but we can't detect this.
      var stack = ReactSharedInternals.getCurrentStack(currentStack);

      if (stack !== '') {
        format += '%s';
        args = args.concat([stack]);
      }
    }

    if (isErrorLogger) {
      // Don't prefix our default logging formatting in ReactFiberErrorLoggger.
      // Don't toString the arguments.
      args.unshift(format);
    } else {
      // TODO: Remove this prefix and stop toStringing in the wrapper and
      // instead do it at each callsite as needed.
      // Careful: RN currently depends on this prefix
      // eslint-disable-next-line react-internal/safe-string-coercion
      args = args.map(function (item) {
        return String(item);
      });
      args.unshift('Warning: ' + format);
    } // We intentionally don't use spread (or .apply) directly because it
    // breaks IE9: https://github.com/facebook/react/issues/13610
    // eslint-disable-next-line react-internal/no-production-logging


    Function.prototype.apply.call(console[level], console, args);
  }
}

var REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element') ;
var REACT_CONTEXT_TYPE = Symbol.for('react.context');
var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
var REACT_MEMO_TYPE = Symbol.for('react.memo');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
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
var ASYNC_ITERATOR = Symbol.asyncIterator;

var isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

var getPrototypeOf = Object.getPrototypeOf;

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


  if (getPrototypeOf(object)) {
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
  if (!isObjectPrototype(getPrototypeOf(object))) {
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

        if (value !== null && value.$$typeof === CLIENT_REFERENCE_TAG) {
          return describeClientReference();
        }

        var name = objectName(value);

        if (name === 'Object') {
          return '{...}';
        }

        return name;
      }

    case 'function':
      {
        if (value.$$typeof === CLIENT_REFERENCE_TAG) {
          return describeClientReference();
        }

        var _name = value.displayName || value.name;

        return _name ? 'function ' + _name : 'function';
      }

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

var CLIENT_REFERENCE_TAG = Symbol.for('react.client.reference');

function describeClientReference(ref) {
  return 'client';
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
    } else if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG) {
      return describeClientReference();
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

        var _name2 = _names[_i3];
        str += describeKeyForErrorMessage(_name2) + ': ';
        var _value3 = _object[_name2];

        var _substr3 = void 0;

        if (typeof _value3 === 'object' && _value3 !== null) {
          _substr3 = describeObjectForErrorMessage(_value3);
        } else {
          _substr3 = describeValueForErrorMessage(_value3);
        }

        if (_name2 === expandedName) {
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

function writeTemporaryReference(set, reference, object) {
  set.set(reference, object);
}
function readTemporaryReference(set, reference) {
  return set.get(reference);
}

var ObjectPrototype = Object.prototype;
var knownServerReferences = new WeakMap(); // Serializable values
// Thenable<ReactServerValue>

function serializeByValueID(id) {
  return '$' + id.toString(16);
}

function serializePromiseID(id) {
  return '$@' + id.toString(16);
}

function serializeServerReferenceID(id) {
  return '$F' + id.toString(16);
}

function serializeTemporaryReferenceMarker() {
  return '$T';
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

function serializeBlobID(id) {
  return '$B' + id.toString(16);
}

function serializeIteratorID(id) {
  return '$i' + id.toString(16);
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

function processReply(root, formFieldPrefix, temporaryReferences, resolve, reject) {
  var nextPartId = 1;
  var pendingParts = 0;
  var formData = null;
  var writtenObjects = new WeakMap();
  var modelRoot = root;

  function serializeTypedArray(tag, typedArray) {
    var blob = new Blob([// We should be able to pass the buffer straight through but Node < 18 treat
    // multi-byte array blobs differently so we first convert it to single-byte.
    new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)]);
    var blobId = nextPartId++;

    if (formData === null) {
      formData = new FormData();
    }

    formData.append(formFieldPrefix + blobId, blob);
    return '$' + tag + blobId.toString(16);
  }

  function serializeBinaryReader(reader) {
    if (formData === null) {
      // Upgrade to use FormData to allow us to stream this value.
      formData = new FormData();
    }

    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;
    var buffer = [];

    function progress(entry) {
      if (entry.done) {
        var blobId = nextPartId++; // eslint-disable-next-line react-internal/safe-string-coercion

        data.append(formFieldPrefix + blobId, new Blob(buffer)); // eslint-disable-next-line react-internal/safe-string-coercion

        data.append(formFieldPrefix + streamId, '"$o' + blobId.toString(16) + '"'); // eslint-disable-next-line react-internal/safe-string-coercion

        data.append(formFieldPrefix + streamId, 'C'); // Close signal

        pendingParts--;

        if (pendingParts === 0) {
          resolve(data);
        }
      } else {
        buffer.push(entry.value);
        reader.read(new Uint8Array(1024)).then(progress, reject);
      }
    }

    reader.read(new Uint8Array(1024)).then(progress, reject);
    return '$r' + streamId.toString(16);
  }

  function serializeReader(reader) {
    if (formData === null) {
      // Upgrade to use FormData to allow us to stream this value.
      formData = new FormData();
    }

    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;

    function progress(entry) {
      if (entry.done) {
        // eslint-disable-next-line react-internal/safe-string-coercion
        data.append(formFieldPrefix + streamId, 'C'); // Close signal

        pendingParts--;

        if (pendingParts === 0) {
          resolve(data);
        }
      } else {
        try {
          // $FlowFixMe[incompatible-type]: While plain JSON can return undefined we never do here.
          var partJSON = JSON.stringify(entry.value, resolveToJSON); // eslint-disable-next-line react-internal/safe-string-coercion

          data.append(formFieldPrefix + streamId, partJSON);
          reader.read().then(progress, reject);
        } catch (x) {
          reject(x);
        }
      }
    }

    reader.read().then(progress, reject);
    return '$R' + streamId.toString(16);
  }

  function serializeReadableStream(stream) {
    // Detect if this is a BYOB stream. BYOB streams should be able to be read as bytes on the
    // receiving side. For binary streams, we serialize them as plain Blobs.
    var binaryReader;

    try {
      // $FlowFixMe[extra-arg]: This argument is accepted.
      binaryReader = stream.getReader({
        mode: 'byob'
      });
    } catch (x) {
      return serializeReader(stream.getReader());
    }

    return serializeBinaryReader(binaryReader);
  }

  function serializeAsyncIterable(iterable, iterator) {
    if (formData === null) {
      // Upgrade to use FormData to allow us to stream this value.
      formData = new FormData();
    }

    var data = formData;
    pendingParts++;
    var streamId = nextPartId++; // Generators/Iterators are Iterables but they're also their own iterator
    // functions. If that's the case, we treat them as single-shot. Otherwise,
    // we assume that this iterable might be a multi-shot and allow it to be
    // iterated more than once on the receiving server.

    var isIterator = iterable === iterator; // There's a race condition between when the stream is aborted and when the promise
    // resolves so we track whether we already aborted it to avoid writing twice.

    function progress(entry) {
      if (entry.done) {
        if (entry.value === undefined) {
          // eslint-disable-next-line react-internal/safe-string-coercion
          data.append(formFieldPrefix + streamId, 'C'); // Close signal
        } else {
          // Unlike streams, the last value may not be undefined. If it's not
          // we outline it and encode a reference to it in the closing instruction.
          try {
            // $FlowFixMe[incompatible-type]: While plain JSON can return undefined we never do here.
            var partJSON = JSON.stringify(entry.value, resolveToJSON);
            data.append(formFieldPrefix + streamId, 'C' + partJSON); // Close signal
          } catch (x) {
            reject(x);
            return;
          }
        }

        pendingParts--;

        if (pendingParts === 0) {
          resolve(data);
        }
      } else {
        try {
          // $FlowFixMe[incompatible-type]: While plain JSON can return undefined we never do here.
          var _partJSON = JSON.stringify(entry.value, resolveToJSON); // eslint-disable-next-line react-internal/safe-string-coercion


          data.append(formFieldPrefix + streamId, _partJSON);
          iterator.next().then(progress, reject);
        } catch (x) {
          reject(x);
          return;
        }
      }
    }

    iterator.next().then(progress, reject);
    return '$' + (isIterator ? 'x' : 'X') + streamId.toString(16);
  }

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
      switch (value.$$typeof) {
        case REACT_ELEMENT_TYPE:
          {
            if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
              // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
              var parentReference = writtenObjects.get(parent);

              if (parentReference !== undefined) {
                // If the parent has a reference, we can refer to this object indirectly
                // through the property name inside that parent.
                var reference = parentReference + ':' + key; // Store this object so that the server can refer to it later in responses.

                writeTemporaryReference(temporaryReferences, reference, value);
                return serializeTemporaryReferenceMarker();
              }
            }

            throw new Error('React Element cannot be passed to Server Functions from the Client without a ' + 'temporary reference set. Pass a TemporaryReferenceSet to the options.' + (describeObjectForErrorMessage(parent, key) ));
          }

        case REACT_LAZY_TYPE:
          {
            // Resolve lazy as if it wasn't here. In the future this will be encoded as a Promise.
            var lazy = value;
            var payload = lazy._payload;
            var init = lazy._init;

            if (formData === null) {
              // Upgrade to use FormData to allow us to stream this value.
              formData = new FormData();
            }

            pendingParts++;

            try {
              var resolvedModel = init(payload); // We always outline this as a separate part even though we could inline it
              // because it ensures a more deterministic encoding.

              var lazyId = nextPartId++;
              var partJSON = serializeModel(resolvedModel, lazyId); // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.

              var data = formData; // eslint-disable-next-line react-internal/safe-string-coercion

              data.append(formFieldPrefix + lazyId, partJSON);
              return serializeByValueID(lazyId);
            } catch (x) {
              if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
                // Suspended
                pendingParts++;

                var _lazyId = nextPartId++;

                var thenable = x;

                var retry = function () {
                  // While the first promise resolved, its value isn't necessarily what we'll
                  // resolve into because we might suspend again.
                  try {
                    var _partJSON2 = serializeModel(value, _lazyId); // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.


                    var _data = formData; // eslint-disable-next-line react-internal/safe-string-coercion

                    _data.append(formFieldPrefix + _lazyId, _partJSON2);

                    pendingParts--;

                    if (pendingParts === 0) {
                      resolve(_data);
                    }
                  } catch (reason) {
                    reject(reason);
                  }
                };

                thenable.then(retry, retry);
                return serializeByValueID(_lazyId);
              } else {
                // In the future we could consider serializing this as an error
                // that throws on the server instead.
                reject(x);
                return null;
              }
            } finally {
              pendingParts--;
            }
          }
      } // $FlowFixMe[method-unbinding]


      if (typeof value.then === 'function') {
        // We assume that any object with a .then property is a "Thenable" type,
        // or a Promise type. Either of which can be represented by a Promise.
        if (formData === null) {
          // Upgrade to use FormData to allow us to stream this value.
          formData = new FormData();
        }

        pendingParts++;
        var promiseId = nextPartId++;
        var _thenable = value;

        _thenable.then(function (partValue) {
          try {
            var _partJSON3 = serializeModel(partValue, promiseId); // $FlowFixMe[incompatible-type] We know it's not null because we assigned it above.


            var _data2 = formData; // eslint-disable-next-line react-internal/safe-string-coercion

            _data2.append(formFieldPrefix + promiseId, _partJSON3);

            pendingParts--;

            if (pendingParts === 0) {
              resolve(_data2);
            }
          } catch (reason) {
            reject(reason);
          }
        }, // In the future we could consider serializing this as an error
        // that throws on the server instead.
        reject);

        return serializePromiseID(promiseId);
      }

      var existingReference = writtenObjects.get(value);

      if (existingReference !== undefined) {
        if (modelRoot === value) {
          // This is the ID we're currently emitting so we need to write it
          // once but if we discover it again, we refer to it by id.
          modelRoot = null;
        } else {
          // We've already emitted this as an outlined object, so we can
          // just refer to that by its existing ID.
          return existingReference;
        }
      } else if (key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        var _parentReference = writtenObjects.get(parent);

        if (_parentReference !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          var _reference = _parentReference + ':' + key;

          writtenObjects.set(value, _reference);

          if (temporaryReferences !== undefined) {
            // Store this object so that the server can refer to it later in responses.
            writeTemporaryReference(temporaryReferences, _reference, value);
          }
        }
      }

      if (isArray(value)) {
        // $FlowFixMe[incompatible-return]
        return value;
      } // TODO: Should we the Object.prototype.toString.call() to test for cross-realm objects?


      if (value instanceof FormData) {
        if (formData === null) {
          // Upgrade to use FormData to allow us to use rich objects as its values.
          formData = new FormData();
        }

        var _data3 = formData;
        var refId = nextPartId++; // Copy all the form fields with a prefix for this reference.
        // These must come first in the form order because we assume that all the
        // fields are available before this is referenced.

        var prefix = formFieldPrefix + refId + '_'; // $FlowFixMe[prop-missing]: FormData has forEach.

        value.forEach(function (originalValue, originalKey) {
          _data3.append(prefix + originalKey, originalValue);
        });
        return serializeFormDataReference(refId);
      }

      if (value instanceof Map) {
        var mapId = nextPartId++;

        var _partJSON4 = serializeModel(Array.from(value), mapId);

        if (formData === null) {
          formData = new FormData();
        }

        formData.append(formFieldPrefix + mapId, _partJSON4);
        return serializeMapID(mapId);
      }

      if (value instanceof Set) {
        var setId = nextPartId++;

        var _partJSON5 = serializeModel(Array.from(value), setId);

        if (formData === null) {
          formData = new FormData();
        }

        formData.append(formFieldPrefix + setId, _partJSON5);
        return serializeSetID(setId);
      }

      {
        if (value instanceof ArrayBuffer) {
          var blob = new Blob([value]);
          var blobId = nextPartId++;

          if (formData === null) {
            formData = new FormData();
          }

          formData.append(formFieldPrefix + blobId, blob);
          return '$' + 'A' + blobId.toString(16);
        }

        if (value instanceof Int8Array) {
          // char
          return serializeTypedArray('O', value);
        }

        if (value instanceof Uint8Array) {
          // unsigned char
          return serializeTypedArray('o', value);
        }

        if (value instanceof Uint8ClampedArray) {
          // unsigned clamped char
          return serializeTypedArray('U', value);
        }

        if (value instanceof Int16Array) {
          // sort
          return serializeTypedArray('S', value);
        }

        if (value instanceof Uint16Array) {
          // unsigned short
          return serializeTypedArray('s', value);
        }

        if (value instanceof Int32Array) {
          // long
          return serializeTypedArray('L', value);
        }

        if (value instanceof Uint32Array) {
          // unsigned long
          return serializeTypedArray('l', value);
        }

        if (value instanceof Float32Array) {
          // float
          return serializeTypedArray('G', value);
        }

        if (value instanceof Float64Array) {
          // double
          return serializeTypedArray('g', value);
        }

        if (value instanceof BigInt64Array) {
          // number
          return serializeTypedArray('M', value);
        }

        if (value instanceof BigUint64Array) {
          // unsigned number
          // We use "m" instead of "n" since JSON can start with "null"
          return serializeTypedArray('m', value);
        }

        if (value instanceof DataView) {
          return serializeTypedArray('V', value);
        } // TODO: Blob is not available in old Node/browsers. Remove the typeof check later.


        if (typeof Blob === 'function' && value instanceof Blob) {
          if (formData === null) {
            formData = new FormData();
          }

          var _blobId = nextPartId++;

          formData.append(formFieldPrefix + _blobId, value);
          return serializeBlobID(_blobId);
        }
      }

      var iteratorFn = getIteratorFn(value);

      if (iteratorFn) {
        var iterator = iteratorFn.call(value);

        if (iterator === value) {
          // Iterator, not Iterable
          var iteratorId = nextPartId++;

          var _partJSON6 = serializeModel(Array.from(iterator), iteratorId);

          if (formData === null) {
            formData = new FormData();
          }

          formData.append(formFieldPrefix + iteratorId, _partJSON6);
          return serializeIteratorID(iteratorId);
        }

        return Array.from(iterator);
      }

      {
        // TODO: ReadableStream is not available in old Node. Remove the typeof check later.
        if (typeof ReadableStream === 'function' && value instanceof ReadableStream) {
          return serializeReadableStream(value);
        }

        var getAsyncIterator = value[ASYNC_ITERATOR];

        if (typeof getAsyncIterator === 'function') {
          // We treat AsyncIterables as a Fragment and as such we might need to key them.
          return serializeAsyncIterable(value, getAsyncIterator.call(value));
        }
      } // Verify that this is a simple plain object.


      var proto = getPrototypeOf(value);

      if (proto !== ObjectPrototype && (proto === null || getPrototypeOf(proto) !== null)) {
        if (temporaryReferences === undefined) {
          throw new Error('Only plain objects, and a few built-ins, can be passed to Server Actions. ' + 'Classes or null prototypes are not supported.');
        } // We will have written this object to the temporary reference set above
        // so we can replace it with a marker to refer to this slot later.


        return serializeTemporaryReferenceMarker();
      }

      {
        if (value.$$typeof === (REACT_CONTEXT_TYPE )) {
          error('React Context Providers cannot be passed to Server Functions from the Client.%s', describeObjectForErrorMessage(parent, key));
        } else if (objectName(value) !== 'Object') {
          error('Only plain objects can be passed to Server Functions from the Client. ' + '%s objects are not supported.%s', objectName(value), describeObjectForErrorMessage(parent, key));
        } else if (!isSimpleObject(value)) {
          error('Only plain objects can be passed to Server Functions from the Client. ' + 'Classes or other objects with methods are not supported.%s', describeObjectForErrorMessage(parent, key));
        } else if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(value);

          if (symbols.length > 0) {
            error('Only plain objects can be passed to Server Functions from the Client. ' + 'Objects with symbol properties like %s are not supported.%s', symbols[0].description, describeObjectForErrorMessage(parent, key));
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

      if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        var _parentReference2 = writtenObjects.get(parent);

        if (_parentReference2 !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          var _reference2 = _parentReference2 + ':' + key; // Store this object so that the server can refer to it later in responses.


          writeTemporaryReference(temporaryReferences, _reference2, value);
          return serializeTemporaryReferenceMarker();
        }
      }

      throw new Error('Client Functions cannot be passed directly to Server Functions. ' + 'Only Functions passed from the Server can be passed back again.');
    }

    if (typeof value === 'symbol') {
      if (temporaryReferences !== undefined && key.indexOf(':') === -1) {
        // TODO: If the property name contains a colon, we don't dedupe. Escape instead.
        var _parentReference3 = writtenObjects.get(parent);

        if (_parentReference3 !== undefined) {
          // If the parent has a reference, we can refer to this object indirectly
          // through the property name inside that parent.
          var _reference3 = _parentReference3 + ':' + key; // Store this object so that the server can refer to it later in responses.


          writeTemporaryReference(temporaryReferences, _reference3, value);
          return serializeTemporaryReferenceMarker();
        }
      }

      throw new Error('Symbols cannot be passed to a Server Function without a ' + 'temporary reference set. Pass a TemporaryReferenceSet to the options.' + (describeObjectForErrorMessage(parent, key) ));
    }

    if (typeof value === 'bigint') {
      return serializeBigInt(value);
    }

    throw new Error("Type " + typeof value + " is not supported as an argument to a Server Function.");
  }

  function serializeModel(model, id) {
    if (typeof model === 'object' && model !== null) {
      var reference = serializeByValueID(id);
      writtenObjects.set(model, reference);

      if (temporaryReferences !== undefined) {
        // Store this object so that the server can refer to it later in responses.
        writeTemporaryReference(temporaryReferences, reference, model);
      }
    }

    modelRoot = model; // $FlowFixMe[incompatible-return] it's not going to be undefined because we'll encode it.

    return JSON.stringify(model, resolveToJSON);
  }

  var json = serializeModel(root, 0);

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
  processReply(reference, '', undefined, // TODO: This means React Elements can't be used as state in progressive enhancement.
  function (body) {
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

function defaultEncodeFormAction(identifierPrefix) {
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

function customEncodeFormAction(proxy, identifierPrefix, encodeFormAction) {
  var reference = knownServerReferences.get(proxy);

  if (!reference) {
    throw new Error('Tried to encode a Server Action from a different instance than the encoder is from. ' + 'This is a bug in React.');
  }

  var boundPromise = reference.bound;

  if (boundPromise === null) {
    boundPromise = Promise.resolve([]);
  }

  return encodeFormAction(reference.id, boundPromise);
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

function registerServerReference(proxy, reference, encodeFormAction) {
  // Expose encoder for use by SSR, as well as a special bind that can be used to
  // keep server capabilities.
  {
    // Only expose this in builds that would actually use it. Not needed on the client.
    var $$FORM_ACTION = encodeFormAction === undefined ? defaultEncodeFormAction : function (identifierPrefix) {
      return customEncodeFormAction(this, identifierPrefix, encodeFormAction);
    };
    Object.defineProperties(proxy, {
      $$FORM_ACTION: {
        value: $$FORM_ACTION
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
    {
      var thisBind = arguments[0];

      if (thisBind != null) {
        // This doesn't warn in browser environments since it's not instrumented outside
        // usedWithSSR. This makes this an SSR only warning which we don't generally do.
        // TODO: Consider a DEV only instrumentation in the browser.
        error('Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().');
      }
    }

    var args = ArraySlice.call(arguments, 1);
    var boundPromise = null;

    if (reference.bound !== null) {
      boundPromise = Promise.resolve(reference.bound).then(function (boundArgs) {
        return boundArgs.concat(args);
      });
    } else {
      boundPromise = Promise.resolve(args);
    } // Expose encoder for use by SSR, as well as a special bind that can be used to
    // keep server capabilities.


    {
      // Only expose this in builds that would actually use it. Not needed on the client.
      Object.defineProperties(newFn, {
        $$FORM_ACTION: {
          value: this.$$FORM_ACTION
        },
        $$IS_SIGNATURE_EQUAL: {
          value: isSignatureEqual
        },
        bind: {
          value: bind
        }
      });
    }

    knownServerReferences.set(newFn, {
      id: reference.id,
      bound: boundPromise
    });
  }

  return newFn;
}

function createServerReference$1(id, callServer, encodeFormAction) {
  var proxy = function () {
    // $FlowFixMe[method-unbinding]
    var args = Array.prototype.slice.call(arguments);
    return callServer(id, args);
  };

  registerServerReference(proxy, {
    id: id,
    bound: null
  }, encodeFormAction);
  return proxy;
}

var ROW_ID = 0;
var ROW_TAG = 1;
var ROW_LENGTH = 2;
var ROW_CHUNK_BY_NEWLINE = 3;
var ROW_CHUNK_BY_LENGTH = 4;
var PENDING = 'pending';
var BLOCKED = 'blocked';
var CYCLIC = 'cyclic';
var RESOLVED_MODEL = 'resolved_model';
var RESOLVED_MODULE = 'resolved_module';
var INITIALIZED = 'fulfilled';
var ERRORED = 'rejected'; // $FlowFixMe[missing-this-annot]

function Chunk(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;

  {
    this._debugInfo = null;
  }
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
    case CYCLIC:
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
      if (reject) {
        reject(chunk.reason);
      }

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
    case CYCLIC:
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
    case CYCLIC:
      if (chunk.value) {
        for (var i = 0; i < resolveListeners.length; i++) {
          chunk.value.push(resolveListeners[i]);
        }
      } else {
        chunk.value = resolveListeners;
      }

      if (chunk.reason) {
        if (rejectListeners) {
          for (var _i = 0; _i < rejectListeners.length; _i++) {
            chunk.reason.push(rejectListeners[_i]);
          }
        }
      } else {
        chunk.reason = rejectListeners;
      }

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
    {
      // If we get more data to an already resolved ID, we assume that it's
      // a stream chunk since any other row shouldn't have more than one entry.
      var streamChunk = chunk;
      var controller = streamChunk.reason; // $FlowFixMe[incompatible-call]: The error method should accept mixed.

      controller.error(error);
    }

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

function createInitializedIteratorResultChunk(response, value, done) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(INITIALIZED, {
    done: done,
    value: value
  }, null, response);
}

function createInitializedStreamChunk(response, value, controller) {
  // We use the reason field to stash the controller since we already have that
  // field. It's a bit of a hack but efficient.
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(INITIALIZED, value, controller, response);
}

function createResolvedIteratorResultChunk(response, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  var iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}'; // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors

  return new Chunk(RESOLVED_MODEL, iteratorResultJSON, null, response);
}

function resolveIteratorResultChunk(chunk, value, done) {
  // To reuse code as much code as possible we add the wrapper element as part of the JSON.
  var iteratorResultJSON = (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + '}';
  resolveModelChunk(chunk, iteratorResultJSON);
}

function resolveModelChunk(chunk, value) {
  if (chunk.status !== PENDING) {
    {
      // If we get more data to an already resolved ID, we assume that it's
      // a stream chunk since any other row shouldn't have more than one entry.
      var streamChunk = chunk;
      var controller = streamChunk.reason;
      controller.enqueueModel(value);
    }

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
  var resolvedModel = chunk.value; // We go to the CYCLIC state until we've fully resolved this.
  // We do this before parsing in case we try to initialize the same chunk
  // while parsing the model. Such as in a cyclic reference.

  var cyclicChunk = chunk;
  cyclicChunk.status = CYCLIC;
  cyclicChunk.value = null;
  cyclicChunk.reason = null;

  try {
    var value = parseModel(chunk._response, resolvedModel);

    if (initializingChunkBlockedModel !== null && initializingChunkBlockedModel.deps > 0) {
      initializingChunkBlockedModel.value = value; // We discovered new dependencies on modules that are not yet resolved.
      // We have to go the BLOCKED state until they're resolved.

      var blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
    } else {
      var resolveListeners = cyclicChunk.value;
      var initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = value;

      if (resolveListeners !== null) {
        wakeChunk(resolveListeners, value);
      }
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

function nullRefGetter() {
  {
    return null;
  }
}

function createElement(response, type, key, props, owner, // DEV-only
stack, // DEV-only
validated) // DEV-only
{
  var element;

  {
    // `ref` is non-enumerable in dev
    element = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: type,
      key: key,
      props: props,
      _owner: owner
    };
    Object.defineProperty(element, 'ref', {
      enumerable: false,
      get: nullRefGetter
    });
  }

  {
    // We don't really need to add any of these but keeping them for good measure.
    // Unfortunately, _store is enumerable in jest matchers so for equality to
    // work, I need to keep it or make _store non-enumerable in the other file.
    element._store = {};
    Object.defineProperty(element._store, 'validated', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: 1 // Whether the element has already been validated on the server.

    }); // debugInfo contains Server Component debug information.

    Object.defineProperty(element, '_debugInfo', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: null
    });
    // _debugInfo later. We could move it into _store which remains mutable.


    if (initializingChunkBlockedModel !== null) {
      var freeze = Object.freeze.bind(Object, element.props);
      initializingChunk.then(freeze, freeze);
    } else {
      Object.freeze(element.props);
    }
  }

  return element;
}

function createLazyChunkWrapper(chunk) {
  var lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: chunk,
    _init: readChunk
  };

  {
    // Ensure we have a live array to track future debug info.
    var chunkDebugInfo = chunk._debugInfo || (chunk._debugInfo = []);
    lazyType._debugInfo = chunkDebugInfo;
  }

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

function createModelResolver(chunk, parentObject, key, cyclic, response, map, path) {
  var blocked;

  if (initializingChunkBlockedModel) {
    blocked = initializingChunkBlockedModel;

    if (!cyclic) {
      blocked.deps++;
    }
  } else {
    blocked = initializingChunkBlockedModel = {
      deps: cyclic ? 0 : 1,
      value: null
    };
  }

  return function (value) {
    for (var i = 1; i < path.length; i++) {
      value = value[path[i]];
    }

    parentObject[key] = map(response, value); // If this is the root object for a model reference, where `blocked.value`
    // is a stale `null`, the resolved value can be used directly.

    if (key === '' && blocked.value === null) {
      blocked.value = parentObject[key];
    }

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

  registerServerReference(proxy, metaData, response._encodeFormAction);
  return proxy;
}

function getOutlinedModel(response, reference, parentObject, key, map) {
  var path = reference.split(':');
  var id = parseInt(path[0], 16);
  var chunk = getChunk(response, id);

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
      var value = chunk.value;

      for (var i = 1; i < path.length; i++) {
        value = value[path[i]];
      }

      var chunkValue = map(response, value);

      if (chunk._debugInfo) {
        // If we have a direct reference to an object that was rendered by a synchronous
        // server component, it might have some debug info about how it was rendered.
        // We forward this to the underlying object. This might be a React Element or
        // an Array fragment.
        // If this was a string / number return value we lose the debug info. We choose
        // that tradeoff to allow sync server components to return plain values and not
        // use them as React Nodes necessarily. We could otherwise wrap them in a Lazy.
        if (typeof chunkValue === 'object' && chunkValue !== null && (Array.isArray(chunkValue) || typeof chunkValue[ASYNC_ITERATOR] === 'function' || chunkValue.$$typeof === REACT_ELEMENT_TYPE) && !chunkValue._debugInfo) {
          // We should maybe use a unique symbol for arrays but this is a React owned array.
          // $FlowFixMe[prop-missing]: This should be added to elements.
          Object.defineProperty(chunkValue, '_debugInfo', {
            configurable: false,
            enumerable: false,
            writable: true,
            value: chunk._debugInfo
          });
        }
      }

      return chunkValue;

    case PENDING:
    case BLOCKED:
    case CYCLIC:
      var parentChunk = initializingChunk;
      chunk.then(createModelResolver(parentChunk, parentObject, key, chunk.status === CYCLIC, response, map, path), createModelReject(parentChunk));
      return null;

    default:
      throw chunk.reason;
  }
}

function createMap(response, model) {
  return new Map(model);
}

function createSet(response, model) {
  return new Set(model);
}

function createBlob(response, model) {
  return new Blob(model.slice(1), {
    type: model[0]
  });
}

function createFormData(response, model) {
  var formData = new FormData();

  for (var i = 0; i < model.length; i++) {
    formData.append(model[i][0], model[i][1]);
  }

  return formData;
}

function extractIterator(response, model) {
  // $FlowFixMe[incompatible-use]: This uses raw Symbols because we're extracting from a native array.
  return model[Symbol.iterator]();
}

function createModel(response, model) {
  return model;
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
          if (value.length === 2) {
            // Infinite promise that never resolves.
            return new Promise(function () {});
          }

          var _id = parseInt(value.slice(2), 16);

          var _chunk = getChunk(response, _id);

          return _chunk;
        }

      case 'S':
        {
          // Symbol
          return Symbol.for(value.slice(2));
        }

      case 'F':
        {
          // Server Reference
          var ref = value.slice(2);
          return getOutlinedModel(response, ref, parentObject, key, createServerReferenceProxy);
        }

      case 'T':
        {
          // Temporary Reference
          var reference = '$' + value.slice(2);
          var temporaryReferences = response._tempRefs;

          if (temporaryReferences == null) {
            throw new Error('Missing a temporary reference set but the RSC response returned a temporary reference. ' + 'Pass a temporaryReference option with the set that was used with the reply.');
          }

          return readTemporaryReference(temporaryReferences, reference);
        }

      case 'Q':
        {
          // Map
          var _ref = value.slice(2);

          return getOutlinedModel(response, _ref, parentObject, key, createMap);
        }

      case 'W':
        {
          // Set
          var _ref2 = value.slice(2);

          return getOutlinedModel(response, _ref2, parentObject, key, createSet);
        }

      case 'B':
        {
          // Blob
          {
            var _ref3 = value.slice(2);

            return getOutlinedModel(response, _ref3, parentObject, key, createBlob);
          }
        }

      case 'K':
        {
          // FormData
          var _ref4 = value.slice(2);

          return getOutlinedModel(response, _ref4, parentObject, key, createFormData);
        }

      case 'i':
        {
          // Iterator
          var _ref5 = value.slice(2);

          return getOutlinedModel(response, _ref5, parentObject, key, extractIterator);
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

      case 'E':
        {
          {
            // In DEV mode we allow indirect eval to produce functions for logging.
            // This should not compile to eval() because then it has local scope access.
            try {
              // eslint-disable-next-line no-eval
              return (0, eval)(value.slice(2));
            } catch (x) {
              // We currently use this to express functions so we fail parsing it,
              // let's just return a blank function as a place holder.
              return function () {};
            }
          } // Fallthrough

        }

      default:
        {
          // We assume that anything else is a reference ID.
          var _ref6 = value.slice(1);

          return getOutlinedModel(response, _ref6, parentObject, key, createModel);
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
    return createElement(response, tuple[1], tuple[2], tuple[3], tuple[4] );
  }

  return value;
}

function missingCall() {
  throw new Error('Trying to call a function from "use server" but the callServer option ' + 'was not implemented in your router runtime.');
}

function createResponse(bundlerConfig, moduleLoading, callServer, encodeFormAction, nonce, temporaryReferences, findSourceMapURL) {
  var chunks = new Map();
  var response = {
    _bundlerConfig: bundlerConfig,
    _moduleLoading: moduleLoading,
    _callServer: callServer !== undefined ? callServer : missingCall,
    _encodeFormAction: encodeFormAction,
    _nonce: nonce,
    _chunks: chunks,
    _stringDecoder: createStringDecoder(),
    _fromJSON: null,
    _rowState: 0,
    _rowID: 0,
    _rowTag: 0,
    _rowLength: 0,
    _buffer: [],
    _tempRefs: temporaryReferences
  };

  {
    response._debugFindSourceMapURL = findSourceMapURL;
  } // Don't inline this call because it causes closure to outline the call above.


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
  var chunks = response._chunks;

  {
    var chunk = chunks.get(id);

    if (chunk && chunk.status !== PENDING) {
      // If we get more data to an already resolved ID, we assume that it's
      // a stream chunk since any other row shouldn't have more than one entry.
      var streamChunk = chunk;
      var controller = streamChunk.reason;
      controller.enqueueValue(text);
      return;
    }
  }

  chunks.set(id, createInitializedTextChunk(response, text));
}

function resolveBuffer(response, id, buffer) {
  var chunks = response._chunks;

  {
    var chunk = chunks.get(id);

    if (chunk && chunk.status !== PENDING) {
      // If we get more data to an already resolved ID, we assume that it's
      // a stream chunk since any other row shouldn't have more than one entry.
      var streamChunk = chunk;
      var controller = streamChunk.reason;
      controller.enqueueValue(buffer);
      return;
    }
  }

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

function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk) {
    chunks.set(id, createInitializedStreamChunk(response, stream, controller));
    return;
  }

  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  var resolveListeners = chunk.value;
  var resolvedChunk = chunk;
  resolvedChunk.status = INITIALIZED;
  resolvedChunk.value = stream;
  resolvedChunk.reason = controller;

  if (resolveListeners !== null) {
    wakeChunk(resolveListeners, chunk.value);
  }
}

function startReadableStream(response, id, type) {
  var controller = null;
  var stream = new ReadableStream({
    type: type,
    start: function (c) {
      controller = c;
    }
  });
  var previousBlockedChunk = null;
  var flightController = {
    enqueueValue: function (value) {
      if (previousBlockedChunk === null) {
        controller.enqueue(value);
      } else {
        // We're still waiting on a previous chunk so we can't enqueue quite yet.
        previousBlockedChunk.then(function () {
          controller.enqueue(value);
        });
      }
    },
    enqueueModel: function (json) {
      if (previousBlockedChunk === null) {
        // If we're not blocked on any other chunks, we can try to eagerly initialize
        // this as a fast-path to avoid awaiting them.
        var chunk = createResolvedModelChunk(response, json);
        initializeModelChunk(chunk);
        var initializedChunk = chunk;

        if (initializedChunk.status === INITIALIZED) {
          controller.enqueue(initializedChunk.value);
        } else {
          chunk.then(function (v) {
            return controller.enqueue(v);
          }, function (e) {
            return controller.error(e);
          });
          previousBlockedChunk = chunk;
        }
      } else {
        // We're still waiting on a previous chunk so we can't enqueue quite yet.
        var blockedChunk = previousBlockedChunk;

        var _chunk2 = createPendingChunk(response);

        _chunk2.then(function (v) {
          return controller.enqueue(v);
        }, function (e) {
          return controller.error(e);
        });

        previousBlockedChunk = _chunk2;
        blockedChunk.then(function () {
          if (previousBlockedChunk === _chunk2) {
            // We were still the last chunk so we can now clear the queue and return
            // to synchronous emitting.
            previousBlockedChunk = null;
          }

          resolveModelChunk(_chunk2, json);
        });
      }
    },
    close: function (json) {
      if (previousBlockedChunk === null) {
        controller.close();
      } else {
        var blockedChunk = previousBlockedChunk; // We shouldn't get any more enqueues after this so we can set it back to null.

        previousBlockedChunk = null;
        blockedChunk.then(function () {
          return controller.close();
        });
      }
    },
    error: function (error) {
      if (previousBlockedChunk === null) {
        // $FlowFixMe[incompatible-call]
        controller.error(error);
      } else {
        var blockedChunk = previousBlockedChunk; // We shouldn't get any more enqueues after this so we can set it back to null.

        previousBlockedChunk = null;
        blockedChunk.then(function () {
          return controller.error(error);
        });
      }
    }
  };
  resolveStream(response, id, stream, flightController);
}

function asyncIterator() {
  // Self referencing iterator.
  return this;
}

function createIterator(next) {
  var iterator = {
    next: next // TODO: Add return/throw as options for aborting.

  }; // TODO: The iterator could inherit the AsyncIterator prototype which is not exposed as
  // a global but exists as a prototype of an AsyncGenerator. However, it's not needed
  // to satisfy the iterable protocol.

  iterator[ASYNC_ITERATOR] = asyncIterator;
  return iterator;
}

function startAsyncIterable(response, id, iterator) {
  var buffer = [];
  var closed = false;
  var nextWriteIndex = 0;
  var flightController = {
    enqueueValue: function (value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createInitializedIteratorResultChunk(response, value, false);
      } else {
        var chunk = buffer[nextWriteIndex];
        var resolveListeners = chunk.value;
        var rejectListeners = chunk.reason;
        var initializedChunk = chunk;
        initializedChunk.status = INITIALIZED;
        initializedChunk.value = {
          done: false,
          value: value
        };

        if (resolveListeners !== null) {
          wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
        }
      }

      nextWriteIndex++;
    },
    enqueueModel: function (value) {
      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, false);
      } else {
        resolveIteratorResultChunk(buffer[nextWriteIndex], value, false);
      }

      nextWriteIndex++;
    },
    close: function (value) {
      closed = true;

      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createResolvedIteratorResultChunk(response, value, true);
      } else {
        resolveIteratorResultChunk(buffer[nextWriteIndex], value, true);
      }

      nextWriteIndex++;

      while (nextWriteIndex < buffer.length) {
        // In generators, any extra reads from the iterator have the value undefined.
        resolveIteratorResultChunk(buffer[nextWriteIndex++], '"$undefined"', true);
      }
    },
    error: function (error) {
      closed = true;

      if (nextWriteIndex === buffer.length) {
        buffer[nextWriteIndex] = createPendingChunk(response);
      }

      while (nextWriteIndex < buffer.length) {
        triggerErrorOnChunk(buffer[nextWriteIndex++], error);
      }
    }
  };

  var iterable = _defineProperty({}, ASYNC_ITERATOR, function () {
    var nextReadIndex = 0;
    return createIterator(function (arg) {
      if (arg !== undefined) {
        throw new Error('Values cannot be passed to next() of AsyncIterables passed to Client Components.');
      }

      if (nextReadIndex === buffer.length) {
        if (closed) {
          // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
          return new Chunk(INITIALIZED, {
            done: true,
            value: undefined
          }, null, response);
        }

        buffer[nextReadIndex] = createPendingChunk(response);
      }

      return buffer[nextReadIndex++];
    });
  }); // TODO: If it's a single shot iterator we can optimize memory by cleaning up the buffer after
  // reading through the end, but currently we favor code size over this optimization.


  resolveStream(response, id, iterator ? iterable[ASYNC_ITERATOR]() : iterable, flightController);
}

function stopStream(response, id, row) {
  var chunks = response._chunks;
  var chunk = chunks.get(id);

  if (!chunk || chunk.status !== INITIALIZED) {
    // We didn't expect not to have an existing stream;
    return;
  }

  var streamChunk = chunk;
  var controller = streamChunk.reason;
  controller.close(row === '' ? '"$undefined"' : row);
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

function resolveHint(response, code, model) {
  var hintModel = parseModel(response, model);
  dispatchHint(code, hintModel);
} // eslint-disable-next-line react-internal/no-production-logging

function resolveDebugInfo(response, id, debugInfo) {
  var chunk = getChunk(response, id);
  var chunkDebugInfo = chunk._debugInfo || (chunk._debugInfo = []);
  chunkDebugInfo.push(debugInfo);
}

function resolveConsoleEntry(response, value) {

  var payload = parseModel(response, value);
  var methodName = payload[0];
  var env = payload[3];
  var args = payload.slice(4);

  {
    // Printing with stack isn't really limited to owner stacks but
    // we gate it behind the same flag for now while iterating.
    printToConsole(methodName, args, env);
    return;
  }
}

function mergeBuffer(buffer, lastChunk) {
  var l = buffer.length; // Count the bytes we'll need

  var byteLength = lastChunk.length;

  for (var i = 0; i < l; i++) {
    byteLength += buffer[i].byteLength;
  } // Allocate enough contiguous space


  var result = new Uint8Array(byteLength);
  var offset = 0; // Copy all the buffers into it.

  for (var _i2 = 0; _i2 < l; _i2++) {
    var chunk = buffer[_i2];
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

      case 79
      /* "O" */
      :
        resolveTypedArray(response, id, buffer, chunk, Int8Array, 1);
        return;

      case 111
      /* "o" */
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

      case 71
      /* "G" */
      :
        resolveTypedArray(response, id, buffer, chunk, Float32Array, 4);
        return;

      case 103
      /* "g" */
      :
        resolveTypedArray(response, id, buffer, chunk, Float64Array, 8);
        return;

      case 77
      /* "M" */
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

    case 68
    /* "D" */
    :
      {
        {
          var debugInfo = parseModel(response, row);
          resolveDebugInfo(response, id, debugInfo);
          return;
        } // Fallthrough to share the error with Console entries.

      }

    case 87
    /* "W" */
    :
      {
        {
          resolveConsoleEntry(response, row);
          return;
        }
      }

    case 82
    /* "R" */
    :
      {
        {
          startReadableStream(response, id, undefined);
          return;
        }
      }
    // Fallthrough

    case 114
    /* "r" */
    :
      {
        {
          startReadableStream(response, id, 'bytes');
          return;
        }
      }
    // Fallthrough

    case 88
    /* "X" */
    :
      {
        {
          startAsyncIterable(response, id, false);
          return;
        }
      }
    // Fallthrough

    case 120
    /* "x" */
    :
      {
        {
          startAsyncIterable(response, id, true);
          return;
        }
      }
    // Fallthrough

    case 67
    /* "C" */
    :
      {
        {
          stopStream(response, id, row);
          return;
        }
      }
    // Fallthrough

    case 80
    /* "P" */
    :
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
          || resolvedRowTag === 79
          /* "O" */
          || resolvedRowTag === 111
          /* "o" */
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
          || resolvedRowTag === 71
          /* "G" */
          || resolvedRowTag === 103
          /* "g" */
          || resolvedRowTag === 77
          /* "M" */
          || resolvedRowTag === 109
          /* "m" */
          || resolvedRowTag === 86)
          /* "V" */
          ) {
              rowTag = resolvedRowTag;
              rowState = ROW_LENGTH;
              i++;
            } else if (resolvedRowTag > 64 && resolvedRowTag < 91 ||
          /* "A"-"Z" */
          resolvedRowTag === 114
          /* "r" */
          || resolvedRowTag === 120
          /* "x" */
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
  var response = createResponse(ssrManifest.moduleMap, ssrManifest.moduleLoading, noServerCall, options ? options.encodeFormAction : undefined, options && typeof options.nonce === 'string' ? options.nonce : undefined, undefined, // TODO: If encodeReply is supported, this should support temporaryReferences
  options && options.findSourceMapURL ? options.findSourceMapURL : undefined);
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
