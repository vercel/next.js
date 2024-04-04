/**
 * @license React
 * react-server-dom-webpack-server.node.unbundled.production.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var util = require('util');
require('crypto');
var async_hooks = require('async_hooks');
var React = require('react');
var ReactDOM = require('react-dom');

// -----------------------------------------------------------------------------
const enablePostpone = false;

function scheduleWork(callback) {
  setImmediate(callback);
}
function flushBuffered(destination) {
  // If we don't have any more data to send right now.
  // Flush whatever is in the buffer to the wire.
  if (typeof destination.flush === 'function') {
    // By convention the Zlib streams provide a flush function for this purpose.
    // For Express, compression middleware adds this method.
    destination.flush();
  }
}
const VIEW_SIZE = 2048;
let currentView = null;
let writtenBytes = 0;
let destinationHasCapacity = true;
function beginWriting(destination) {
  currentView = new Uint8Array(VIEW_SIZE);
  writtenBytes = 0;
  destinationHasCapacity = true;
}

function writeStringChunk(destination, stringChunk) {
  if (stringChunk.length === 0) {
    return;
  } // maximum possible view needed to encode entire string


  if (stringChunk.length * 3 > VIEW_SIZE) {
    if (writtenBytes > 0) {
      writeToDestination(destination, currentView.subarray(0, writtenBytes));
      currentView = new Uint8Array(VIEW_SIZE);
      writtenBytes = 0;
    }

    writeToDestination(destination, textEncoder.encode(stringChunk));
    return;
  }

  let target = currentView;

  if (writtenBytes > 0) {
    target = currentView.subarray(writtenBytes);
  }

  const _textEncoder$encodeIn = textEncoder.encodeInto(stringChunk, target),
        read = _textEncoder$encodeIn.read,
        written = _textEncoder$encodeIn.written;

  writtenBytes += written;

  if (read < stringChunk.length) {
    writeToDestination(destination, currentView.subarray(0, writtenBytes));
    currentView = new Uint8Array(VIEW_SIZE);
    writtenBytes = textEncoder.encodeInto(stringChunk.slice(read), currentView).written;
  }

  if (writtenBytes === VIEW_SIZE) {
    writeToDestination(destination, currentView);
    currentView = new Uint8Array(VIEW_SIZE);
    writtenBytes = 0;
  }
}

function writeViewChunk(destination, chunk) {
  if (chunk.byteLength === 0) {
    return;
  }

  if (chunk.byteLength > VIEW_SIZE) {
    // this chunk may overflow a single view which implies it was not
    // one that is cached by the streaming renderer. We will enqueu
    // it directly and expect it is not re-used
    if (writtenBytes > 0) {
      writeToDestination(destination, currentView.subarray(0, writtenBytes));
      currentView = new Uint8Array(VIEW_SIZE);
      writtenBytes = 0;
    }

    writeToDestination(destination, chunk);
    return;
  }

  let bytesToWrite = chunk;
  const allowableBytes = currentView.length - writtenBytes;

  if (allowableBytes < bytesToWrite.byteLength) {
    // this chunk would overflow the current view. We enqueue a full view
    // and start a new view with the remaining chunk
    if (allowableBytes === 0) {
      // the current view is already full, send it
      writeToDestination(destination, currentView);
    } else {
      // fill up the current view and apply the remaining chunk bytes
      // to a new view.
      currentView.set(bytesToWrite.subarray(0, allowableBytes), writtenBytes);
      writtenBytes += allowableBytes;
      writeToDestination(destination, currentView);
      bytesToWrite = bytesToWrite.subarray(allowableBytes);
    }

    currentView = new Uint8Array(VIEW_SIZE);
    writtenBytes = 0;
  }

  currentView.set(bytesToWrite, writtenBytes);
  writtenBytes += bytesToWrite.byteLength;

  if (writtenBytes === VIEW_SIZE) {
    writeToDestination(destination, currentView);
    currentView = new Uint8Array(VIEW_SIZE);
    writtenBytes = 0;
  }
}

function writeChunk(destination, chunk) {
  if (typeof chunk === 'string') {
    writeStringChunk(destination, chunk);
  } else {
    writeViewChunk(destination, chunk);
  }
}

function writeToDestination(destination, view) {
  const currentHasCapacity = destination.write(view);
  destinationHasCapacity = destinationHasCapacity && currentHasCapacity;
}

function writeChunkAndReturn(destination, chunk) {
  writeChunk(destination, chunk);
  return destinationHasCapacity;
}
function completeWriting(destination) {
  if (currentView && writtenBytes > 0) {
    destination.write(currentView.subarray(0, writtenBytes));
  }

  currentView = null;
  writtenBytes = 0;
  destinationHasCapacity = true;
}
function close$1(destination) {
  destination.end();
}
const textEncoder = new util.TextEncoder();
function stringToChunk(content) {
  return content;
}
function byteLengthOfChunk(chunk) {
  return typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.byteLength;
}
function closeWithError(destination, error) {
  // $FlowFixMe[incompatible-call]: This is an Error object or the destination accepts other types.
  destination.destroy(error);
}

// eslint-disable-next-line no-unused-vars
const CLIENT_REFERENCE_TAG$1 = Symbol.for('react.client.reference');
const SERVER_REFERENCE_TAG = Symbol.for('react.server.reference');
function isClientReference(reference) {
  return reference.$$typeof === CLIENT_REFERENCE_TAG$1;
}
function isServerReference(reference) {
  return reference.$$typeof === SERVER_REFERENCE_TAG;
}
function registerClientReference(proxyImplementation, id, exportName) {
  return registerClientReferenceImpl(proxyImplementation, id + '#' + exportName, false);
}

function registerClientReferenceImpl(proxyImplementation, id, async) {
  return Object.defineProperties(proxyImplementation, {
    $$typeof: {
      value: CLIENT_REFERENCE_TAG$1
    },
    $$id: {
      value: id
    },
    $$async: {
      value: async
    }
  });
} // $FlowFixMe[method-unbinding]


const FunctionBind = Function.prototype.bind; // $FlowFixMe[method-unbinding]

const ArraySlice = Array.prototype.slice;

function bind() {
  // $FlowFixMe[unsupported-syntax]
  const newFn = FunctionBind.apply(this, arguments);

  if (this.$$typeof === SERVER_REFERENCE_TAG) {

    const args = ArraySlice.call(arguments, 1);
    return Object.defineProperties(newFn, {
      $$typeof: {
        value: SERVER_REFERENCE_TAG
      },
      $$id: {
        value: this.$$id
      },
      $$bound: {
        value: this.$$bound ? this.$$bound.concat(args) : args
      },
      bind: {
        value: bind
      }
    });
  }

  return newFn;
}

function registerServerReference(reference, id, exportName) {
  return Object.defineProperties(reference, {
    $$typeof: {
      value: SERVER_REFERENCE_TAG
    },
    $$id: {
      value: exportName === null ? id : id + '#' + exportName,
      configurable: true
    },
    $$bound: {
      value: null,
      configurable: true
    },
    bind: {
      value: bind,
      configurable: true
    }
  });
}
const PROMISE_PROTOTYPE = Promise.prototype;
const deepProxyHandlers = {
  get: function (target, name, receiver) {
    switch (name) {
      // These names are read by the Flight runtime if you end up using the exports object.
      case '$$typeof':
        // These names are a little too common. We should probably have a way to
        // have the Flight runtime extract the inner target instead.
        return target.$$typeof;

      case '$$id':
        return target.$$id;

      case '$$async':
        return target.$$async;

      case 'name':
        return target.name;

      case 'displayName':
        return undefined;
      // We need to special case this because createElement reads it if we pass this
      // reference.

      case 'defaultProps':
        return undefined;
      // Avoid this attempting to be serialized.

      case 'toJSON':
        return undefined;

      case Symbol.toPrimitive:
        // $FlowFixMe[prop-missing]
        return Object.prototype[Symbol.toPrimitive];

      case Symbol.toStringTag:
        // $FlowFixMe[prop-missing]
        return Object.prototype[Symbol.toStringTag];

      case 'Provider':
        throw new Error("Cannot render a Client Context Provider on the Server. " + "Instead, you can export a Client Component wrapper " + "that itself renders a Client Context Provider.");
    } // eslint-disable-next-line react-internal/safe-string-coercion


    const expression = String(target.name) + '.' + String(name);
    throw new Error("Cannot access " + expression + " on the server. " + 'You cannot dot into a client module from a server component. ' + 'You can only pass the imported name through.');
  },
  set: function () {
    throw new Error('Cannot assign to a client module from a server module.');
  }
};

function getReference(target, name) {
  switch (name) {
    // These names are read by the Flight runtime if you end up using the exports object.
    case '$$typeof':
      return target.$$typeof;

    case '$$id':
      return target.$$id;

    case '$$async':
      return target.$$async;

    case 'name':
      return target.name;
    // We need to special case this because createElement reads it if we pass this
    // reference.

    case 'defaultProps':
      return undefined;
    // Avoid this attempting to be serialized.

    case 'toJSON':
      return undefined;

    case Symbol.toPrimitive:
      // $FlowFixMe[prop-missing]
      return Object.prototype[Symbol.toPrimitive];

    case Symbol.toStringTag:
      // $FlowFixMe[prop-missing]
      return Object.prototype[Symbol.toStringTag];

    case '__esModule':
      // Something is conditionally checking which export to use. We'll pretend to be
      // an ESM compat module but then we'll check again on the client.
      const moduleId = target.$$id;
      target.default = registerClientReferenceImpl(function () {
        throw new Error("Attempted to call the default export of " + moduleId + " from the server " + "but it's on the client. It's not possible to invoke a client function from " + "the server, it can only be rendered as a Component or passed to props of a " + "Client Component.");
      }, target.$$id + '#', target.$$async);
      return true;

    case 'then':
      if (target.then) {
        // Use a cached value
        return target.then;
      }

      if (!target.$$async) {
        // If this module is expected to return a Promise (such as an AsyncModule) then
        // we should resolve that with a client reference that unwraps the Promise on
        // the client.
        const clientReference = registerClientReferenceImpl({}, target.$$id, true);
        const proxy = new Proxy(clientReference, proxyHandlers); // Treat this as a resolved Promise for React's use()

        target.status = 'fulfilled';
        target.value = proxy;
        const then = target.then = registerClientReferenceImpl(function then(resolve, reject) {
          // Expose to React.
          return Promise.resolve(resolve(proxy));
        }, // If this is not used as a Promise but is treated as a reference to a `.then`
        // export then we should treat it as a reference to that name.
        target.$$id + '#then', false);
        return then;
      } else {
        // Since typeof .then === 'function' is a feature test we'd continue recursing
        // indefinitely if we return a function. Instead, we return an object reference
        // if we check further.
        return undefined;
      }

  }

  if (typeof name === 'symbol') {
    throw new Error('Cannot read Symbol exports. Only named exports are supported on a client module ' + 'imported on the server.');
  }

  let cachedReference = target[name];

  if (!cachedReference) {
    const reference = registerClientReferenceImpl(function () {
      throw new Error( // eslint-disable-next-line react-internal/safe-string-coercion
      "Attempted to call " + String(name) + "() from the server but " + String(name) + " is on the client. " + "It's not possible to invoke a client function from the server, it can " + "only be rendered as a Component or passed to props of a Client Component.");
    }, target.$$id + '#' + name, target.$$async);
    Object.defineProperty(reference, 'name', {
      value: name
    });
    cachedReference = target[name] = new Proxy(reference, deepProxyHandlers);
  }

  return cachedReference;
}

const proxyHandlers = {
  get: function (target, name, receiver) {
    return getReference(target, name);
  },
  getOwnPropertyDescriptor: function (target, name) {
    let descriptor = Object.getOwnPropertyDescriptor(target, name);

    if (!descriptor) {
      descriptor = {
        value: getReference(target, name),
        writable: false,
        configurable: false,
        enumerable: false
      };
      Object.defineProperty(target, name, descriptor);
    }

    return descriptor;
  },

  getPrototypeOf(target) {
    // Pretend to be a Promise in case anyone asks.
    return PROMISE_PROTOTYPE;
  },

  set: function () {
    throw new Error('Cannot assign to a client module from a server module.');
  }
};
function createClientModuleProxy(moduleId) {
  const clientReference = registerClientReferenceImpl({}, // Represents the whole Module object instead of a particular import.
  moduleId, false);
  return new Proxy(clientReference, proxyHandlers);
}

function getClientReferenceKey(reference) {
  return reference.$$async ? reference.$$id + '#async' : reference.$$id;
}
function resolveClientReferenceMetadata(config, clientReference) {
  const modulePath = clientReference.$$id;
  let name = '';
  let resolvedModuleData = config[modulePath];

  if (resolvedModuleData) {
    // The potentially aliased name.
    name = resolvedModuleData.name;
  } else {
    // We didn't find this specific export name but we might have the * export
    // which contains this name as well.
    // TODO: It's unfortunate that we now have to parse this string. We should
    // probably go back to encoding path and name separately on the client reference.
    const idx = modulePath.lastIndexOf('#');

    if (idx !== -1) {
      name = modulePath.slice(idx + 1);
      resolvedModuleData = config[modulePath.slice(0, idx)];
    }

    if (!resolvedModuleData) {
      throw new Error('Could not find the module "' + modulePath + '" in the React Client Manifest. ' + 'This is probably a bug in the React Server Components bundler.');
    }
  }

  if (clientReference.$$async === true) {
    return [resolvedModuleData.id, resolvedModuleData.chunks, name, 1];
  } else {
    return [resolvedModuleData.id, resolvedModuleData.chunks, name];
  }
}
function getServerReferenceId(config, serverReference) {
  return serverReference.$$id;
}
function getServerReferenceBoundArguments(config, serverReference) {
  return serverReference.$$bound;
}

const ReactDOMSharedInternals = ReactDOM.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

const ReactDOMFlightServerDispatcher = {
  prefetchDNS,
  preconnect,
  preload,
  preloadModule: preloadModule$1,
  preinitStyle,
  preinitScript,
  preinitModuleScript
};

function prefetchDNS(href) {
  {
    if (typeof href === 'string' && href) {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        const key = 'D|' + href;

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);
        emitHint(request, 'D', href);
      }
    }
  }
}

function preconnect(href, crossOrigin) {
  {
    if (typeof href === 'string') {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        const key = "C|" + (crossOrigin == null ? 'null' : crossOrigin) + "|" + href;

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);

        if (typeof crossOrigin === 'string') {
          emitHint(request, 'C', [href, crossOrigin]);
        } else {
          emitHint(request, 'C', href);
        }
      }
    }
  }
}

function preload(href, as, options) {
  {
    if (typeof href === 'string') {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        let key = 'L';

        if (as === 'image' && options) {
          key += getImagePreloadKey(href, options.imageSrcSet, options.imageSizes);
        } else {
          key += "[" + as + "]" + href;
        }

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);
        const trimmed = trimOptions(options);

        if (trimmed) {
          emitHint(request, 'L', [href, as, trimmed]);
        } else {
          emitHint(request, 'L', [href, as]);
        }
      }
    }
  }
}

function preloadModule$1(href, options) {
  {
    if (typeof href === 'string') {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        const key = 'm|' + href;

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);
        const trimmed = trimOptions(options);

        if (trimmed) {
          return emitHint(request, 'm', [href, trimmed]);
        } else {
          return emitHint(request, 'm', href);
        }
      }
    }
  }
}

function preinitStyle(href, precedence, options) {
  {
    if (typeof href === 'string') {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        const key = 'S|' + href;

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);
        const trimmed = trimOptions(options);

        if (trimmed) {
          return emitHint(request, 'S', [href, typeof precedence === 'string' ? precedence : 0, trimmed]);
        } else if (typeof precedence === 'string') {
          return emitHint(request, 'S', [href, precedence]);
        } else {
          return emitHint(request, 'S', href);
        }
      }
    }
  }
}

function preinitScript(href, options) {
  {
    if (typeof href === 'string') {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        const key = 'X|' + href;

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);
        const trimmed = trimOptions(options);

        if (trimmed) {
          return emitHint(request, 'X', [href, trimmed]);
        } else {
          return emitHint(request, 'X', href);
        }
      }
    }
  }
}

function preinitModuleScript(href, options) {
  {
    if (typeof href === 'string') {
      const request = resolveRequest();

      if (request) {
        const hints = getHints(request);
        const key = 'M|' + href;

        if (hints.has(key)) {
          // duplicate hint
          return;
        }

        hints.add(key);
        const trimmed = trimOptions(options);

        if (trimmed) {
          return emitHint(request, 'M', [href, trimmed]);
        } else {
          return emitHint(request, 'M', href);
        }
      }
    }
  }
} // Flight normally encodes undefined as a special character however for directive option
// arguments we don't want to send unnecessary keys and bloat the payload so we create a
// trimmed object which omits any keys with null or undefined values.
// This is only typesafe because these option objects have entirely optional fields where
// null and undefined represent the same thing as no property.


function trimOptions(options) {
  if (options == null) return null;
  let hasProperties = false;
  const trimmed = {};

  for (const key in options) {
    if (options[key] != null) {
      hasProperties = true;
      trimmed[key] = options[key];
    }
  }

  return hasProperties ? trimmed : null;
}

function getImagePreloadKey(href, imageSrcSet, imageSizes) {
  let uniquePart = '';

  if (typeof imageSrcSet === 'string' && imageSrcSet !== '') {
    uniquePart += '[' + imageSrcSet + ']';

    if (typeof imageSizes === 'string') {
      uniquePart += '[' + imageSizes + ']';
    }
  } else {
    uniquePart += '[][]' + href;
  }

  return "[image]" + uniquePart;
}

const ReactDOMCurrentDispatcher = ReactDOMSharedInternals.Dispatcher;
function prepareHostDispatcher() {
  ReactDOMCurrentDispatcher.current = ReactDOMFlightServerDispatcher;
} // Used to distinguish these contexts from ones used in other renderers.
// small, smaller than how we encode undefined, and is unambiguous. We could use
// a different tuple structure to encode this instead but this makes the runtime
// cost cheaper by eliminating a type checks in more positions.
// prettier-ignore

function createHints() {
  return new Set();
}

const supportsRequestStorage = true;
const requestStorage = new async_hooks.AsyncLocalStorage();

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
const REACT_CONTEXT_TYPE = Symbol.for('react.context');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
const REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
const REACT_MEMO_TYPE = Symbol.for('react.memo');
const REACT_LAZY_TYPE = Symbol.for('react.lazy');
const REACT_MEMO_CACHE_SENTINEL = Symbol.for('react.memo_cache_sentinel');
const REACT_POSTPONE_TYPE = Symbol.for('react.postpone');
const MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
const FAUX_ITERATOR_SYMBOL = '@@iterator';
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== 'object') {
    return null;
  }

  const maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];

  if (typeof maybeIterator === 'function') {
    return maybeIterator;
  }

  return null;
}

// Corresponds to ReactFiberWakeable and ReactFizzWakeable modules. Generally,
// changes to one module should be reflected in the others.
// TODO: Rename this module and the corresponding Fiber one to "Thenable"
// instead of "Wakeable". Or some other more appropriate name.
// An error that is thrown (e.g. by `use`) to trigger Suspense. If we
// detect this is caught by userspace, we'll log a warning in development.
const SuspenseException = new Error("Suspense Exception: This is not a real error! It's an implementation " + 'detail of `use` to interrupt the current render. You must either ' + 'rethrow it immediately, or move the `use` call outside of the ' + '`try/catch` block. Capturing without rethrowing will lead to ' + 'unexpected behavior.\n\n' + 'To handle async errors, wrap your component in an error boundary, or ' + "call the promise's `.catch` method and pass the result to `use`");
function createThenableState() {
  // The ThenableState is created the first time a component suspends. If it
  // suspends again, we'll reuse the same state.
  return [];
}

function noop() {}

function trackUsedThenable(thenableState, thenable, index) {
  const previous = thenableState[index];

  if (previous === undefined) {
    thenableState.push(thenable);
  } else {
    if (previous !== thenable) {
      // Reuse the previous thenable, and drop the new one. We can assume
      // they represent the same value, because components are idempotent.
      // Avoid an unhandled rejection errors for the Promises that we'll
      // intentionally ignore.
      thenable.then(noop, noop);
      thenable = previous;
    }
  } // We use an expando to track the status and result of a thenable so that we
  // can synchronously unwrap the value. Think of this as an extension of the
  // Promise API, or a custom interface that is a superset of Thenable.
  //
  // If the thenable doesn't have a status, set it to "pending" and attach
  // a listener that will update its status and result when it resolves.


  switch (thenable.status) {
    case 'fulfilled':
      {
        const fulfilledValue = thenable.value;
        return fulfilledValue;
      }

    case 'rejected':
      {
        const rejectedError = thenable.reason;
        throw rejectedError;
      }

    default:
      {
        if (typeof thenable.status === 'string') ; else {
          const pendingThenable = thenable;
          pendingThenable.status = 'pending';
          pendingThenable.then(fulfilledValue => {
            if (thenable.status === 'pending') {
              const fulfilledThenable = thenable;
              fulfilledThenable.status = 'fulfilled';
              fulfilledThenable.value = fulfilledValue;
            }
          }, error => {
            if (thenable.status === 'pending') {
              const rejectedThenable = thenable;
              rejectedThenable.status = 'rejected';
              rejectedThenable.reason = error;
            }
          }); // Check one more time in case the thenable resolved synchronously

          switch (thenable.status) {
            case 'fulfilled':
              {
                const fulfilledThenable = thenable;
                return fulfilledThenable.value;
              }

            case 'rejected':
              {
                const rejectedThenable = thenable;
                throw rejectedThenable.reason;
              }
          }
        } // Suspend.
        //
        // Throwing here is an implementation detail that allows us to unwind the
        // call stack. But we shouldn't allow it to leak into userspace. Throw an
        // opaque placeholder value instead of the actual thenable. If it doesn't
        // get captured by the work loop, log a warning, because that means
        // something in userspace must have caught it.


        suspendedThenable = thenable;
        throw SuspenseException;
      }
  }
} // This is used to track the actual thenable that suspended so it can be
// passed to the rest of the Suspense implementation — which, for historical
// reasons, expects to receive a thenable.

let suspendedThenable = null;
function getSuspendedThenable() {
  // This is called right after `use` suspends by throwing an exception. `use`
  // throws an opaque value instead of the thenable itself so that it can't be
  // caught in userspace. Then the work loop accesses the actual thenable using
  // this function.
  if (suspendedThenable === null) {
    throw new Error('Expected a suspended thenable. This is a bug in React. Please file ' + 'an issue.');
  }

  const thenable = suspendedThenable;
  suspendedThenable = null;
  return thenable;
}

let currentRequest$1 = null;
let thenableIndexCounter = 0;
let thenableState = null;
function prepareToUseHooksForRequest(request) {
  currentRequest$1 = request;
}
function resetHooksForRequest() {
  currentRequest$1 = null;
}
function prepareToUseHooksForComponent(prevThenableState) {
  thenableIndexCounter = 0;
  thenableState = prevThenableState;
}
function getThenableStateAfterSuspending() {
  // If you use() to Suspend this should always exist but if you throw a Promise instead,
  // which is not really supported anymore, it will be empty. We use the empty set as a
  // marker to know if this was a replay of the same component or first attempt.
  const state = thenableState || createThenableState();
  thenableState = null;
  return state;
}
const HooksDispatcher = {
  useMemo(nextCreate) {
    return nextCreate();
  },

  useCallback(callback) {
    return callback;
  },

  useDebugValue() {},

  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  readContext: unsupportedContext,
  useContext: unsupportedContext,
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useEffect: unsupportedHook,
  useId,
  useSyncExternalStore: unsupportedHook,

  useCacheRefresh() {
    return unsupportedRefresh;
  },

  useMemoCache(size) {
    const data = new Array(size);

    for (let i = 0; i < size; i++) {
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    }

    return data;
  },

  use
};

function unsupportedHook() {
  throw new Error('This Hook is not supported in Server Components.');
}

function unsupportedRefresh() {
  throw new Error('Refreshing the cache is not supported in Server Components.');
}

function unsupportedContext() {
  throw new Error('Cannot read a Client Context from a Server Component.');
}

function useId() {
  if (currentRequest$1 === null) {
    throw new Error('useId can only be used while React is rendering');
  }

  const id = currentRequest$1.identifierCount++; // use 'S' for Flight components to distinguish from 'R' and 'r' in Fizz/Client

  return ':' + currentRequest$1.identifierPrefix + 'S' + id.toString(32) + ':';
}

function use(usable) {
  if (usable !== null && typeof usable === 'object' || typeof usable === 'function') {
    // $FlowFixMe[method-unbinding]
    if (typeof usable.then === 'function') {
      // This is a thenable.
      const thenable = usable; // Track the position of the thenable within this fiber.

      const index = thenableIndexCounter;
      thenableIndexCounter += 1;

      if (thenableState === null) {
        thenableState = createThenableState();
      }

      return trackUsedThenable(thenableState, thenable, index);
    } else if (usable.$$typeof === REACT_CONTEXT_TYPE) {
      unsupportedContext();
    }
  }

  if (isClientReference(usable)) {
    if (usable.value != null && usable.value.$$typeof === REACT_CONTEXT_TYPE) {
      // Show a more specific message since it's a common mistake.
      throw new Error('Cannot read a Client Context from a Server Component.');
    } else {
      throw new Error('Cannot use() an already resolved Client Reference.');
    }
  } else {
    throw new Error( // eslint-disable-next-line react-internal/safe-string-coercion
    'An unsupported type was passed to use(): ' + String(usable));
  }
}

function createSignal() {
  return new AbortController().signal;
}

function resolveCache() {
  const request = resolveRequest();

  if (request) {
    return getCache(request);
  }

  return new Map();
}

const DefaultCacheDispatcher = {
  getCacheSignal() {
    const cache = resolveCache();
    let entry = cache.get(createSignal);

    if (entry === undefined) {
      entry = createSignal();
      cache.set(createSignal, entry);
    }

    return entry;
  },

  getCacheForType(resourceType) {
    const cache = resolveCache();
    let entry = cache.get(resourceType);

    if (entry === undefined) {
      entry = resourceType(); // TODO: Warn if undefined?

      cache.set(resourceType, entry);
    }

    return entry;
  }

};

const isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

const getPrototypeOf = Object.getPrototypeOf;

function objectName(object) {
  // $FlowFixMe[method-unbinding]
  const name = Object.prototype.toString.call(object);
  return name.replace(/^\[object (.*)\]$/, function (m, p0) {
    return p0;
  });
}

function describeKeyForErrorMessage(key) {
  const encodedKey = JSON.stringify(key);
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

        const name = objectName(value);

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

        const name = value.displayName || value.name;
        return name ? 'function ' + name : 'function';
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
          const lazyComponent = type;
          const payload = lazyComponent._payload;
          const init = lazyComponent._init;

          try {
            // Lazy may contain any component type so we recursively resolve it.
            return describeElementType(init(payload));
          } catch (x) {}
        }
    }
  }

  return '';
}

const CLIENT_REFERENCE_TAG = Symbol.for('react.client.reference');

function describeClientReference(ref) {
  return 'client';
}

function describeObjectForErrorMessage(objectOrArray, expandedName) {
  const objKind = objectName(objectOrArray);

  if (objKind !== 'Object' && objKind !== 'Array') {
    return objKind;
  }

  let str = '';
  let start = -1;
  let length = 0;

  if (isArray(objectOrArray)) {
    {
      // Print Array
      str = '[';
      const array = objectOrArray;

      for (let i = 0; i < array.length; i++) {
        if (i > 0) {
          str += ', ';
        }

        const value = array[i];
        let substr;

        if (typeof value === 'object' && value !== null) {
          substr = describeObjectForErrorMessage(value);
        } else {
          substr = describeValueForErrorMessage(value);
        }

        if ('' + i === expandedName) {
          start = str.length;
          length = substr.length;
          str += substr;
        } else if (substr.length < 10 && str.length + substr.length < 40) {
          str += substr;
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
    } else {
      // Print Object
      str = '{';
      const object = objectOrArray;
      const names = Object.keys(object);

      for (let i = 0; i < names.length; i++) {
        if (i > 0) {
          str += ', ';
        }

        const name = names[i];
        str += describeKeyForErrorMessage(name) + ': ';
        const value = object[name];
        let substr;

        if (typeof value === 'object' && value !== null) {
          substr = describeObjectForErrorMessage(value);
        } else {
          substr = describeValueForErrorMessage(value);
        }

        if (name === expandedName) {
          start = str.length;
          length = substr.length;
          str += substr;
        } else if (substr.length < 10 && str.length + substr.length < 40) {
          str += substr;
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
    const highlight = ' '.repeat(start) + '^'.repeat(length);
    return '\n  ' + str + '\n  ' + highlight;
  }

  return '\n  ' + str;
}

const ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

const ReactSharedServerInternals = // $FlowFixMe: It's defined in the one we resolve to.
React.__SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

if (!ReactSharedServerInternals) {
  throw new Error('The "react" package in this environment is not configured correctly. ' + 'The "react-server" condition must be enabled in any environment that ' + 'runs React Server Components.');
}

const ObjectPrototype = Object.prototype;
const stringify = JSON.stringify; // Serializable values
// Thenable<ReactClientValue>

const PENDING$1 = 0;
const COMPLETED = 1;
const ABORTED = 3;
const ERRORED$1 = 4;
const ReactCurrentCache = ReactSharedServerInternals.ReactCurrentCache;
const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;

function defaultErrorHandler(error) {
  console['error'](error); // Don't transform to our wrapper
}

function defaultPostponeHandler(reason) {// Noop
}

const OPEN = 0;
const CLOSING = 1;
const CLOSED = 2;
function createRequest(model, bundlerConfig, onError, identifierPrefix, onPostpone, environmentName) {
  if (ReactCurrentCache.current !== null && ReactCurrentCache.current !== DefaultCacheDispatcher) {
    throw new Error('Currently React only supports one RSC renderer at a time.');
  }

  prepareHostDispatcher();
  ReactCurrentCache.current = DefaultCacheDispatcher;
  const abortSet = new Set();
  const pingedTasks = [];
  const cleanupQueue = [];

  const hints = createHints();
  const request = {
    status: OPEN,
    flushScheduled: false,
    fatalError: null,
    destination: null,
    bundlerConfig,
    cache: new Map(),
    nextChunkId: 0,
    pendingChunks: 0,
    hints,
    abortableTasks: abortSet,
    pingedTasks: pingedTasks,
    completedImportChunks: [],
    completedHintChunks: [],
    completedRegularChunks: [],
    completedErrorChunks: [],
    writtenSymbols: new Map(),
    writtenClientReferences: new Map(),
    writtenServerReferences: new Map(),
    writtenObjects: new WeakMap(),
    identifierPrefix: identifierPrefix || '',
    identifierCount: 1,
    taintCleanupQueue: cleanupQueue,
    onError: onError === undefined ? defaultErrorHandler : onError,
    onPostpone: onPostpone === undefined ? defaultPostponeHandler : onPostpone
  };

  const rootTask = createTask(request, model, null, false, abortSet);
  pingedTasks.push(rootTask);
  return request;
}
let currentRequest = null;
function resolveRequest() {
  if (currentRequest) return currentRequest;

  {
    const store = requestStorage.getStore();
    if (store) return store;
  }

  return null;
}

function serializeThenable(request, task, thenable) {
  const newTask = createTask(request, null, task.keyPath, // the server component sequence continues through Promise-as-a-child.
  task.implicitSlot, request.abortableTasks);

  switch (thenable.status) {
    case 'fulfilled':
      {
        // We have the resolved value, we can go ahead and schedule it for serialization.
        newTask.model = thenable.value;
        pingTask(request, newTask);
        return newTask.id;
      }

    case 'rejected':
      {
        const x = thenable.reason;

        {
          const digest = logRecoverableError(request, x);
          emitErrorChunk(request, newTask.id, digest);
        }

        return newTask.id;
      }

    default:
      {
        if (typeof thenable.status === 'string') {
          // Only instrument the thenable if the status if not defined. If
          // it's defined, but an unknown value, assume it's been instrumented by
          // some custom userspace implementation. We treat it as "pending".
          break;
        }

        const pendingThenable = thenable;
        pendingThenable.status = 'pending';
        pendingThenable.then(fulfilledValue => {
          if (thenable.status === 'pending') {
            const fulfilledThenable = thenable;
            fulfilledThenable.status = 'fulfilled';
            fulfilledThenable.value = fulfilledValue;
          }
        }, error => {
          if (thenable.status === 'pending') {
            const rejectedThenable = thenable;
            rejectedThenable.status = 'rejected';
            rejectedThenable.reason = error;
          }
        });
        break;
      }
  }

  thenable.then(value => {
    newTask.model = value;
    pingTask(request, newTask);
  }, reason => {
    {
      newTask.status = ERRORED$1;
      const digest = logRecoverableError(request, reason);
      emitErrorChunk(request, newTask.id, digest);
    }

    request.abortableTasks.delete(newTask);

    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  });
  return newTask.id;
}

function emitHint(request, code, model) {
  emitHintChunk(request, code, model);
  enqueueFlush(request);
}
function getHints(request) {
  return request.hints;
}
function getCache(request) {
  return request.cache;
}

function readThenable(thenable) {
  if (thenable.status === 'fulfilled') {
    return thenable.value;
  } else if (thenable.status === 'rejected') {
    throw thenable.reason;
  }

  throw thenable;
}

function createLazyWrapperAroundWakeable(wakeable) {
  // This is a temporary fork of the `use` implementation until we accept
  // promises everywhere.
  const thenable = wakeable;

  switch (thenable.status) {
    case 'fulfilled':
    case 'rejected':
      break;

    default:
      {
        if (typeof thenable.status === 'string') {
          // Only instrument the thenable if the status if not defined. If
          // it's defined, but an unknown value, assume it's been instrumented by
          // some custom userspace implementation. We treat it as "pending".
          break;
        }

        const pendingThenable = thenable;
        pendingThenable.status = 'pending';
        pendingThenable.then(fulfilledValue => {
          if (thenable.status === 'pending') {
            const fulfilledThenable = thenable;
            fulfilledThenable.status = 'fulfilled';
            fulfilledThenable.value = fulfilledValue;
          }
        }, error => {
          if (thenable.status === 'pending') {
            const rejectedThenable = thenable;
            rejectedThenable.status = 'rejected';
            rejectedThenable.reason = error;
          }
        });
        break;
      }
  }

  const lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: thenable,
    _init: readThenable
  };

  return lazyType;
}

function renderFunctionComponent(request, task, key, Component, props) {
  // Reset the task's thenable state before continuing, so that if a later
  // component suspends we can reuse the same task object. If the same
  // component suspends again, the thenable state will be restored.
  const prevThenableState = task.thenableState;
  task.thenableState = null;

  prepareToUseHooksForComponent(prevThenableState); // The secondArg is always undefined in Server Components since refs error early.

  const secondArg = undefined;
  let result = Component(props, secondArg);

  if (typeof result === 'object' && result !== null && typeof result.then === 'function') {
    // When the return value is in children position we can resolve it immediately,
    // to its value without a wrapper if it's synchronously available.
    const thenable = result;

    if (thenable.status === 'fulfilled') {
      return thenable.value;
    } // TODO: Once we accept Promises as children on the client, we can just return
    // the thenable here.


    result = createLazyWrapperAroundWakeable(result);
  } // Track this element's key on the Server Component on the keyPath context..


  const prevKeyPath = task.keyPath;
  const prevImplicitSlot = task.implicitSlot;

  if (key !== null) {
    // Append the key to the path. Technically a null key should really add the child
    // index. We don't do that to hold the payload small and implementation simple.
    task.keyPath = prevKeyPath === null ? key : prevKeyPath + ',' + key;
  } else if (prevKeyPath === null) {
    // This sequence of Server Components has no keys. This means that it was rendered
    // in a slot that needs to assign an implicit key. Even if children below have
    // explicit keys, they should not be used for the outer most key since it might
    // collide with other slots in that set.
    task.implicitSlot = true;
  }

  const json = renderModelDestructive(request, task, emptyRoot, '', result);
  task.keyPath = prevKeyPath;
  task.implicitSlot = prevImplicitSlot;
  return json;
}

function renderFragment(request, task, children) {

  {
    return children;
  }
}

function renderClientElement(task, type, key, props) {
  {
    return [REACT_ELEMENT_TYPE, type, key, props];
  } // We prepend the terminal client element that actually gets serialized with
} // The chunk ID we're currently rendering that we can assign debug data to.


let debugID = null;

function renderElement(request, task, type, key, ref, props) {
  if (ref !== null && ref !== undefined) {
    // When the ref moves to the regular props object this will implicitly
    // throw for functions. We could probably relax it to a DEV warning for other
    // cases.
    // TODO: `ref` is now just a prop when `enableRefAsProp` is on. Should we
    // do what the above comment says?
    throw new Error('Refs cannot be used in Server Components, nor passed to Client Components.');
  }

  if (typeof type === 'function') {
    if (isClientReference(type)) {
      // This is a reference to a Client Component.
      return renderClientElement(task, type, key, props);
    } // This is a Server Component.


    return renderFunctionComponent(request, task, key, type, props);
  } else if (typeof type === 'string') {
    // This is a host element. E.g. HTML.
    return renderClientElement(task, type, key, props);
  } else if (typeof type === 'symbol') {
    if (type === REACT_FRAGMENT_TYPE && key === null) {
      // For key-less fragments, we add a small optimization to avoid serializing
      // it as a wrapper.
      const prevImplicitSlot = task.implicitSlot;

      if (task.keyPath === null) {
        task.implicitSlot = true;
      }

      const json = renderModelDestructive(request, task, emptyRoot, '', props.children);
      task.implicitSlot = prevImplicitSlot;
      return json;
    } // This might be a built-in React component. We'll let the client decide.
    // Any built-in works as long as its props are serializable.


    return renderClientElement(task, type, key, props);
  } else if (type != null && typeof type === 'object') {
    if (isClientReference(type)) {
      // This is a reference to a Client Component.
      return renderClientElement(task, type, key, props);
    }

    switch (type.$$typeof) {
      case REACT_LAZY_TYPE:
        {
          const payload = type._payload;
          const init = type._init;
          const wrappedType = init(payload);
          return renderElement(request, task, wrappedType, key, ref, props);
        }

      case REACT_FORWARD_REF_TYPE:
        {
          return renderFunctionComponent(request, task, key, type.render, props);
        }

      case REACT_MEMO_TYPE:
        {
          return renderElement(request, task, type.type, key, ref, props);
        }
    }
  }

  throw new Error("Unsupported Server Component type: " + describeValueForErrorMessage(type));
}

function pingTask(request, task) {
  const pingedTasks = request.pingedTasks;
  pingedTasks.push(task);

  if (pingedTasks.length === 1) {
    request.flushScheduled = request.destination !== null;
    scheduleWork(() => performWork(request));
  }
}

function createTask(request, model, keyPath, implicitSlot, abortSet) {
  request.pendingChunks++;
  const id = request.nextChunkId++;

  if (typeof model === 'object' && model !== null) {
    // If we're about to write this into a new task we can assign it an ID early so that
    // any other references can refer to the value we're about to write.
    {
      request.writtenObjects.set(model, id);
    }
  }

  const task = {
    id,
    status: PENDING$1,
    model,
    keyPath,
    implicitSlot,
    ping: () => pingTask(request, task),
    toJSON: function (parentPropertyName, value) {
      const parent = this; // Make sure that `parent[parentPropertyName]` wasn't JSONified before `value` was passed to us

      return renderModel(request, task, parent, parentPropertyName, value);
    },
    thenableState: null
  };
  abortSet.add(task);
  return task;
}

function serializeByValueID(id) {
  return '$' + id.toString(16);
}

function serializeLazyID(id) {
  return '$L' + id.toString(16);
}

function serializePromiseID(id) {
  return '$@' + id.toString(16);
}

function serializeServerReferenceID(id) {
  return '$F' + id.toString(16);
}

function serializeSymbolReference(name) {
  return '$S' + name;
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

function serializeRowHeader(tag, id) {
  return id.toString(16) + ':' + tag;
}

function encodeReferenceChunk(request, id, reference) {
  const json = stringify(reference);
  const row = id.toString(16) + ':' + json + '\n';
  return stringToChunk(row);
}

function serializeClientReference(request, parent, parentPropertyName, clientReference) {
  const clientReferenceKey = getClientReferenceKey(clientReference);
  const writtenClientReferences = request.writtenClientReferences;
  const existingId = writtenClientReferences.get(clientReferenceKey);

  if (existingId !== undefined) {
    if (parent[0] === REACT_ELEMENT_TYPE && parentPropertyName === '1') {
      // If we're encoding the "type" of an element, we can refer
      // to that by a lazy reference instead of directly since React
      // knows how to deal with lazy values. This lets us suspend
      // on this component rather than its parent until the code has
      // loaded.
      return serializeLazyID(existingId);
    }

    return serializeByValueID(existingId);
  }

  try {
    const clientReferenceMetadata = resolveClientReferenceMetadata(request.bundlerConfig, clientReference);
    request.pendingChunks++;
    const importId = request.nextChunkId++;
    emitImportChunk(request, importId, clientReferenceMetadata);
    writtenClientReferences.set(clientReferenceKey, importId);

    if (parent[0] === REACT_ELEMENT_TYPE && parentPropertyName === '1') {
      // If we're encoding the "type" of an element, we can refer
      // to that by a lazy reference instead of directly since React
      // knows how to deal with lazy values. This lets us suspend
      // on this component rather than its parent until the code has
      // loaded.
      return serializeLazyID(importId);
    }

    return serializeByValueID(importId);
  } catch (x) {
    request.pendingChunks++;
    const errorId = request.nextChunkId++;
    const digest = logRecoverableError(request, x);
    emitErrorChunk(request, errorId, digest);
    return serializeByValueID(errorId);
  }
}

function outlineModel(request, value) {
  const newTask = createTask(request, value, null, // The way we use outlining is for reusing an object.
  false, // It makes no sense for that use case to be contextual.
  request.abortableTasks);
  retryTask(request, newTask);
  return newTask.id;
}

function serializeServerReference(request, serverReference) {
  const writtenServerReferences = request.writtenServerReferences;
  const existingId = writtenServerReferences.get(serverReference);

  if (existingId !== undefined) {
    return serializeServerReferenceID(existingId);
  }

  const bound = getServerReferenceBoundArguments(request.bundlerConfig, serverReference);
  const serverReferenceMetadata = {
    id: getServerReferenceId(request.bundlerConfig, serverReference),
    bound: bound ? Promise.resolve(bound) : null
  };
  const metadataId = outlineModel(request, serverReferenceMetadata);
  writtenServerReferences.set(serverReference, metadataId);
  return serializeServerReferenceID(metadataId);
}

function serializeLargeTextString(request, text) {
  request.pendingChunks += 2;
  const textId = request.nextChunkId++;
  const textChunk = stringToChunk(text);
  const binaryLength = byteLengthOfChunk(textChunk);
  const row = textId.toString(16) + ':T' + binaryLength.toString(16) + ',';
  const headerChunk = stringToChunk(row);
  request.completedRegularChunks.push(headerChunk, textChunk);
  return serializeByValueID(textId);
}

function serializeMap(request, map) {
  const entries = Array.from(map);

  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];

    if (typeof key === 'object' && key !== null) {
      const writtenObjects = request.writtenObjects;
      const existingId = writtenObjects.get(key);

      if (existingId === undefined) {
        // Mark all object keys as seen so that they're always outlined.
        writtenObjects.set(key, -1);
      }
    }
  }

  const id = outlineModel(request, entries);
  return '$Q' + id.toString(16);
}

function serializeSet(request, set) {
  const entries = Array.from(set);

  for (let i = 0; i < entries.length; i++) {
    const key = entries[i];

    if (typeof key === 'object' && key !== null) {
      const writtenObjects = request.writtenObjects;
      const existingId = writtenObjects.get(key);

      if (existingId === undefined) {
        // Mark all object keys as seen so that they're always outlined.
        writtenObjects.set(key, -1);
      }
    }
  }

  const id = outlineModel(request, entries);
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

let modelRoot = false;

function renderModel(request, task, parent, key, value) {
  const prevKeyPath = task.keyPath;
  const prevImplicitSlot = task.implicitSlot;

  try {
    return renderModelDestructive(request, task, parent, key, value);
  } catch (thrownValue) {
    const x = thrownValue === SuspenseException ? // This is a special type of exception used for Suspense. For historical
    // reasons, the rest of the Suspense implementation expects the thrown
    // value to be a thenable, because before `use` existed that was the
    // (unstable) API for suspending. This implementation detail can change
    // later, once we deprecate the old API in favor of `use`.
    getSuspendedThenable() : thrownValue; // If the suspended/errored value was an element or lazy it can be reduced
    // to a lazy reference, so that it doesn't error the parent.

    const model = task.model;
    const wasReactNode = typeof model === 'object' && model !== null && (model.$$typeof === REACT_ELEMENT_TYPE || model.$$typeof === REACT_LAZY_TYPE);

    if (typeof x === 'object' && x !== null) {
      // $FlowFixMe[method-unbinding]
      if (typeof x.then === 'function') {
        // Something suspended, we'll need to create a new task and resolve it later.
        const newTask = createTask(request, task.model, task.keyPath, task.implicitSlot, request.abortableTasks);
        const ping = newTask.ping;
        x.then(ping, ping);
        newTask.thenableState = getThenableStateAfterSuspending(); // Restore the context. We assume that this will be restored by the inner
        // functions in case nothing throws so we don't use "finally" here.

        task.keyPath = prevKeyPath;
        task.implicitSlot = prevImplicitSlot;

        if (wasReactNode) {
          return serializeLazyID(newTask.id);
        }

        return serializeByValueID(newTask.id);
      }
    } // Restore the context. We assume that this will be restored by the inner
    // functions in case nothing throws so we don't use "finally" here.


    task.keyPath = prevKeyPath;
    task.implicitSlot = prevImplicitSlot;

    if (wasReactNode) {
      // Something errored. We'll still send everything we have up until this point.
      // We'll replace this element with a lazy reference that throws on the client
      // once it gets rendered.
      request.pendingChunks++;
      const errorId = request.nextChunkId++;
      const digest = logRecoverableError(request, x);
      emitErrorChunk(request, errorId, digest);
      return serializeLazyID(errorId);
    } // Something errored but it was not in a React Node. There's no need to serialize
    // it by value because it'll just error the whole parent row anyway so we can
    // just stop any siblings and error the whole parent row.


    throw x;
  }
}

function renderModelDestructive(request, task, parent, parentPropertyName, value) {
  // Set the currently rendering model
  task.model = value; // Special Symbol, that's very common.

  if (value === REACT_ELEMENT_TYPE) {
    return '$';
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'object') {
    switch (value.$$typeof) {
      case REACT_ELEMENT_TYPE:
        {
          const writtenObjects = request.writtenObjects;
          const existingId = writtenObjects.get(value);

          if (existingId !== undefined) {
            if (modelRoot === value) {
              // This is the ID we're currently emitting so we need to write it
              // once but if we discover it again, we refer to it by id.
              modelRoot = null;
            } else if (existingId === -1) {
              // Seen but not yet outlined.
              // TODO: If we throw here we can treat this as suspending which causes an outline
              // but that is able to reuse the same task if we're already in one but then that
              // will be a lazy future value rather than guaranteed to exist but maybe that's good.
              const newId = outlineModel(request, value);
              return serializeByValueID(newId);
            } else {
              // We've already emitted this as an outlined object, so we can refer to that by its
              // existing ID. TODO: We should use a lazy reference since, unlike plain objects,
              // elements might suspend so it might not have emitted yet even if we have the ID for
              // it. However, this creates an extra wrapper when it's not needed. We should really
              // detect whether this already was emitted and synchronously available. In that
              // case we can refer to it synchronously and only make it lazy otherwise.
              // We currently don't have a data structure that lets us see that though.
              return serializeByValueID(existingId);
            }
          } else {
            // This is the first time we've seen this object. We may never see it again
            // so we'll inline it. Mark it as seen. If we see it again, we'll outline.
            writtenObjects.set(value, -1);
          }

          const element = value;

          const props = element.props;
          let ref;

          {
            ref = element.ref;
          } // Attempt to render the Server Component.


          return renderElement(request, task, element.type, // $FlowFixMe[incompatible-call] the key of an element is null | string
          element.key, ref, props);
        }

      case REACT_LAZY_TYPE:
        {
          // Reset the task's thenable state before continuing. If there was one, it was
          // from suspending the lazy before.
          task.thenableState = null;
          const lazy = value;
          const payload = lazy._payload;
          const init = lazy._init;
          const resolvedModel = init(payload);

          return renderModelDestructive(request, task, emptyRoot, '', resolvedModel);
        }
    }

    if (isClientReference(value)) {
      return serializeClientReference(request, parent, parentPropertyName, value);
    }

    const writtenObjects = request.writtenObjects;
    const existingId = writtenObjects.get(value); // $FlowFixMe[method-unbinding]

    if (typeof value.then === 'function') {
      if (existingId !== undefined) {
        if (modelRoot === value) {
          // This is the ID we're currently emitting so we need to write it
          // once but if we discover it again, we refer to it by id.
          modelRoot = null;
        } else {
          // We've seen this promise before, so we can just refer to the same result.
          return serializePromiseID(existingId);
        }
      } // We assume that any object with a .then property is a "Thenable" type,
      // or a Promise type. Either of which can be represented by a Promise.


      const promiseId = serializeThenable(request, task, value);
      writtenObjects.set(value, promiseId);
      return serializePromiseID(promiseId);
    }

    if (existingId !== undefined) {
      if (modelRoot === value) {
        // This is the ID we're currently emitting so we need to write it
        // once but if we discover it again, we refer to it by id.
        modelRoot = null;
      } else if (existingId === -1) {
        // Seen but not yet outlined.
        const newId = outlineModel(request, value);
        return serializeByValueID(newId);
      } else {
        // We've already emitted this as an outlined object, so we can
        // just refer to that by its existing ID.
        return serializeByValueID(existingId);
      }
    } else {
      // This is the first time we've seen this object. We may never see it again
      // so we'll inline it. Mark it as seen. If we see it again, we'll outline.
      writtenObjects.set(value, -1);
    }

    if (isArray(value)) {
      return renderFragment(request, task, value);
    }

    if (value instanceof Map) {
      return serializeMap(request, value);
    }

    if (value instanceof Set) {
      return serializeSet(request, value);
    }

    const iteratorFn = getIteratorFn(value);

    if (iteratorFn) {
      return renderFragment(request, task, Array.from(value));
    } // Verify that this is a simple plain object.


    const proto = getPrototypeOf(value);

    if (proto !== ObjectPrototype && (proto === null || getPrototypeOf(proto) !== null)) {
      throw new Error('Only plain objects, and a few built-ins, can be passed to Client Components ' + 'from Server Components. Classes or null prototypes are not supported.');
    }


    return value;
  }

  if (typeof value === 'string') {


    if (value[value.length - 1] === 'Z') {
      // Possibly a Date, whose toJSON automatically calls toISOString
      // $FlowFixMe[incompatible-use]
      const originalValue = parent[parentPropertyName];

      if (originalValue instanceof Date) {
        return serializeDateFromDateJSON(value);
      }
    }

    if (value.length >= 1024) {
      // For large strings, we encode them outside the JSON payload so that we
      // don't have to double encode and double parse the strings. This can also
      // be more compact in case the string has a lot of escaped characters.
      return serializeLargeTextString(request, value);
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
    if (isClientReference(value)) {
      return serializeClientReference(request, parent, parentPropertyName, value);
    }

    if (isServerReference(value)) {
      return serializeServerReference(request, value);
    }

    if (/^on[A-Z]/.test(parentPropertyName)) {
      throw new Error('Event handlers cannot be passed to Client Component props.' + describeObjectForErrorMessage(parent, parentPropertyName) + '\nIf you need interactivity, consider converting part of this to a Client Component.');
    } else {
      throw new Error('Functions cannot be passed directly to Client Components ' + 'unless you explicitly expose it by marking it with "use server". ' + 'Or maybe you meant to call this function rather than return it.' + describeObjectForErrorMessage(parent, parentPropertyName));
    }
  }

  if (typeof value === 'symbol') {
    const writtenSymbols = request.writtenSymbols;
    const existingId = writtenSymbols.get(value);

    if (existingId !== undefined) {
      return serializeByValueID(existingId);
    } // $FlowFixMe[incompatible-type] `description` might be undefined


    const name = value.description;

    if (Symbol.for(name) !== value) {
      throw new Error('Only global symbols received from Symbol.for(...) can be passed to Client Components. ' + ("The symbol Symbol.for(" + // $FlowFixMe[incompatible-type] `description` might be undefined
      value.description + ") cannot be found among global symbols.") + describeObjectForErrorMessage(parent, parentPropertyName));
    }

    request.pendingChunks++;
    const symbolId = request.nextChunkId++;
    emitSymbolChunk(request, symbolId, name);
    writtenSymbols.set(value, symbolId);
    return serializeByValueID(symbolId);
  }

  if (typeof value === 'bigint') {

    return serializeBigInt(value);
  }

  throw new Error("Type " + typeof value + " is not supported in Client Component props." + describeObjectForErrorMessage(parent, parentPropertyName));
}

function logPostpone(request, reason) {
  const prevRequest = currentRequest;
  currentRequest = null;

  try {
    const onPostpone = request.onPostpone;

    if (supportsRequestStorage) {
      // Exit the request context while running callbacks.
      requestStorage.run(undefined, onPostpone, reason);
    }
  } finally {
    currentRequest = prevRequest;
  }
}

function logRecoverableError(request, error) {
  const prevRequest = currentRequest;
  currentRequest = null;
  let errorDigest;

  try {
    const onError = request.onError;

    if (supportsRequestStorage) {
      // Exit the request context while running callbacks.
      errorDigest = requestStorage.run(undefined, onError, error);
    }
  } finally {
    currentRequest = prevRequest;
  }

  if (errorDigest != null && typeof errorDigest !== 'string') {
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error("onError returned something with a type other than \"string\". onError should return a string and may return null or undefined but must not return anything else. It received something of type \"" + typeof errorDigest + "\" instead");
  }

  return errorDigest || '';
}

function fatalError(request, error) {


  if (request.destination !== null) {
    request.status = CLOSED;
    closeWithError(request.destination, error);
  } else {
    request.status = CLOSING;
    request.fatalError = error;
  }
}

function emitPostponeChunk(request, id, postponeInstance) {
  let row;

  {
    // No reason included in prod.
    row = serializeRowHeader('P', id) + '\n';
  }

  const processedChunk = stringToChunk(row);
  request.completedErrorChunks.push(processedChunk);
}

function emitErrorChunk(request, id, digest, error) {
  let errorInfo;

  {
    errorInfo = {
      digest
    };
  }

  const row = serializeRowHeader('E', id) + stringify(errorInfo) + '\n';
  const processedChunk = stringToChunk(row);
  request.completedErrorChunks.push(processedChunk);
}

function emitImportChunk(request, id, clientReferenceMetadata) {
  // $FlowFixMe[incompatible-type] stringify can return null
  const json = stringify(clientReferenceMetadata);
  const row = serializeRowHeader('I', id) + json + '\n';
  const processedChunk = stringToChunk(row);
  request.completedImportChunks.push(processedChunk);
}

function emitHintChunk(request, code, model) {
  const json = stringify(model);
  const id = request.nextChunkId++;
  const row = serializeRowHeader('H' + code, id) + json + '\n';
  const processedChunk = stringToChunk(row);
  request.completedHintChunks.push(processedChunk);
}

function emitSymbolChunk(request, id, name) {
  const symbolReference = serializeSymbolReference(name);
  const processedChunk = encodeReferenceChunk(request, id, symbolReference);
  request.completedImportChunks.push(processedChunk);
}

function emitModelChunk(request, id, json) {
  const row = id.toString(16) + ':' + json + '\n';
  const processedChunk = stringToChunk(row);
  request.completedRegularChunks.push(processedChunk);
}

const emptyRoot = {};

function retryTask(request, task) {
  if (task.status !== PENDING$1) {
    // We completed this by other means before we had a chance to retry it.
    return;
  }

  try {
    // Track the root so we know that we have to emit this object even though it
    // already has an ID. This is needed because we might see this object twice
    // in the same toJSON if it is cyclic.
    modelRoot = task.model;

    if (false) ; // We call the destructive form that mutates this task. That way if something
    // suspends again, we can reuse the same task instead of spawning a new one.


    const resolvedModel = renderModelDestructive(request, task, emptyRoot, '', task.model);

    if (false) ; // Track the root again for the resolved object.


    modelRoot = resolvedModel; // The keyPath resets at any terminal child node.

    task.keyPath = null;
    task.implicitSlot = false;
    let json;

    if (typeof resolvedModel === 'object' && resolvedModel !== null) {
      // Object might contain unresolved values like additional elements.
      // This is simulating what the JSON loop would do if this was part of it.
      // $FlowFixMe[incompatible-type] stringify can return null for undefined but we never do
      json = stringify(resolvedModel, task.toJSON);
    } else {
      // If the value is a string, it means it's a terminal value and we already escaped it
      // We don't need to escape it again so it's not passed the toJSON replacer.
      // $FlowFixMe[incompatible-type] stringify can return null for undefined but we never do
      json = stringify(resolvedModel);
    }

    emitModelChunk(request, task.id, json);
    request.abortableTasks.delete(task);
    task.status = COMPLETED;
  } catch (thrownValue) {
    const x = thrownValue === SuspenseException ? // This is a special type of exception used for Suspense. For historical
    // reasons, the rest of the Suspense implementation expects the thrown
    // value to be a thenable, because before `use` existed that was the
    // (unstable) API for suspending. This implementation detail can change
    // later, once we deprecate the old API in favor of `use`.
    getSuspendedThenable() : thrownValue;

    if (typeof x === 'object' && x !== null) {
      // $FlowFixMe[method-unbinding]
      if (typeof x.then === 'function') {
        // Something suspended again, let's pick it back up later.
        const ping = task.ping;
        x.then(ping, ping);
        task.thenableState = getThenableStateAfterSuspending();
        return;
      }
    }

    request.abortableTasks.delete(task);
    task.status = ERRORED$1;
    const digest = logRecoverableError(request, x);
    emitErrorChunk(request, task.id, digest);
  } finally {
  }
}

function performWork(request) {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = HooksDispatcher;
  const prevRequest = currentRequest;
  currentRequest = request;
  prepareToUseHooksForRequest(request);

  try {
    const pingedTasks = request.pingedTasks;
    request.pingedTasks = [];

    for (let i = 0; i < pingedTasks.length; i++) {
      const task = pingedTasks[i];
      retryTask(request, task);
    }

    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  } finally {
    ReactCurrentDispatcher.current = prevDispatcher;
    resetHooksForRequest();
    currentRequest = prevRequest;
  }
}

function abortTask(task, request, errorId) {
  task.status = ABORTED; // Instead of emitting an error per task.id, we emit a model that only
  // has a single value referencing the error.

  const ref = serializeByValueID(errorId);
  const processedChunk = encodeReferenceChunk(request, task.id, ref);
  request.completedErrorChunks.push(processedChunk);
}

function flushCompletedChunks(request, destination) {
  beginWriting();

  try {
    // We emit module chunks first in the stream so that
    // they can be preloaded as early as possible.
    const importsChunks = request.completedImportChunks;
    let i = 0;

    for (; i < importsChunks.length; i++) {
      request.pendingChunks--;
      const chunk = importsChunks[i];
      const keepWriting = writeChunkAndReturn(destination, chunk);

      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }

    importsChunks.splice(0, i); // Next comes hints.

    const hintChunks = request.completedHintChunks;
    i = 0;

    for (; i < hintChunks.length; i++) {
      const chunk = hintChunks[i];
      const keepWriting = writeChunkAndReturn(destination, chunk);

      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }

    hintChunks.splice(0, i); // Next comes model data.

    const regularChunks = request.completedRegularChunks;
    i = 0;

    for (; i < regularChunks.length; i++) {
      request.pendingChunks--;
      const chunk = regularChunks[i];
      const keepWriting = writeChunkAndReturn(destination, chunk);

      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }

    regularChunks.splice(0, i); // Finally, errors are sent. The idea is that it's ok to delay
    // any error messages and prioritize display of other parts of
    // the page.

    const errorChunks = request.completedErrorChunks;
    i = 0;

    for (; i < errorChunks.length; i++) {
      request.pendingChunks--;
      const chunk = errorChunks[i];
      const keepWriting = writeChunkAndReturn(destination, chunk);

      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }

    errorChunks.splice(0, i);
  } finally {
    request.flushScheduled = false;
    completeWriting(destination);
  }

  flushBuffered(destination);

  if (request.pendingChunks === 0) {

    close$1(destination);
  }
}

function startWork(request) {
  request.flushScheduled = request.destination !== null;

  {
    scheduleWork(() => requestStorage.run(request, performWork, request));
  }
}

function enqueueFlush(request) {
  if (request.flushScheduled === false && // If there are pinged tasks we are going to flush anyway after work completes
  request.pingedTasks.length === 0 && // If there is no destination there is nothing we can flush to. A flush will
  // happen when we start flowing again
  request.destination !== null) {
    const destination = request.destination;
    request.flushScheduled = true;
    scheduleWork(() => flushCompletedChunks(request, destination));
  }
}

function startFlowing(request, destination) {
  if (request.status === CLOSING) {
    request.status = CLOSED;
    closeWithError(destination, request.fatalError);
    return;
  }

  if (request.status === CLOSED) {
    return;
  }

  if (request.destination !== null) {
    // We're already flowing.
    return;
  }

  request.destination = destination;

  try {
    flushCompletedChunks(request, destination);
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  }
}
function stopFlowing(request) {
  request.destination = null;
} // This is called to early terminate a request. It creates an error at all pending tasks.

function abort(request, reason) {
  try {
    const abortableTasks = request.abortableTasks;

    if (abortableTasks.size > 0) {
      // We have tasks to abort. We'll emit one error row and then emit a reference
      // to that row from every row that's still remaining.
      request.pendingChunks++;
      const errorId = request.nextChunkId++;

      if (enablePostpone && typeof reason === 'object' && reason !== null && reason.$$typeof === REACT_POSTPONE_TYPE) ; else {
        const error = reason === undefined ? new Error('The render was aborted by the server without a reason.') : reason;
        const digest = logRecoverableError(request, error);
        emitErrorChunk(request, errorId, digest, error);
      }

      abortableTasks.forEach(task => abortTask(task, request, errorId));
      abortableTasks.clear();
    }

    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  }
}

function resolveServerReference(bundlerConfig, id) {
  const idx = id.lastIndexOf('#');
  const specifier = id.slice(0, idx);
  const name = id.slice(idx + 1);
  return {
    specifier,
    name
  };
}
const asyncModuleCache = new Map();
function preloadModule(metadata) {
  const existingPromise = asyncModuleCache.get(metadata.specifier);

  if (existingPromise) {
    if (existingPromise.status === 'fulfilled') {
      return null;
    }

    return existingPromise;
  } else {
    // $FlowFixMe[unsupported-syntax]
    let modulePromise = import(metadata.specifier);

    if (metadata.async) {
      // If the module is async, it must have been a CJS module.
      // CJS modules are accessed through the default export in
      // Node.js so we have to get the default export to get the
      // full module exports.
      modulePromise = modulePromise.then(function (value) {
        return value.default;
      });
    }

    modulePromise.then(value => {
      const fulfilledThenable = modulePromise;
      fulfilledThenable.status = 'fulfilled';
      fulfilledThenable.value = value;
    }, reason => {
      const rejectedThenable = modulePromise;
      rejectedThenable.status = 'rejected';
      rejectedThenable.reason = reason;
    });
    asyncModuleCache.set(metadata.specifier, modulePromise);
    return modulePromise;
  }
}
function requireModule(metadata) {
  let moduleExports; // We assume that preloadModule has been called before, which
  // should have added something to the module cache.

  const promise = asyncModuleCache.get(metadata.specifier);

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

// The server acts as a Client of itself when resolving Server References.
const PENDING = 'pending';
const BLOCKED = 'blocked';
const RESOLVED_MODEL = 'resolved_model';
const INITIALIZED = 'fulfilled';
const ERRORED = 'rejected'; // $FlowFixMe[missing-this-annot]

function Chunk(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
} // We subclass Promise.prototype so that we get other methods like .catch


Chunk.prototype = Object.create(Promise.prototype); // TODO: This doesn't return a new Promise chain unlike the real .then

Chunk.prototype.then = function (resolve, reject) {
  const chunk = this; // If we have resolved content, we try to initialize it first which
  // might put us back into one of the other states.

  switch (chunk.status) {
    case RESOLVED_MODEL:
      initializeModelChunk(chunk);
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

function getRoot(response) {
  const chunk = getChunk(response, 0);
  return chunk;
}

function createPendingChunk(response) {
  // $FlowFixMe[invalid-constructor] Flow doesn't support functions as constructors
  return new Chunk(PENDING, null, null, response);
}

function wakeChunk(listeners, value) {
  for (let i = 0; i < listeners.length; i++) {
    const listener = listeners[i];
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

  const listeners = chunk.reason;
  const erroredChunk = chunk;
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

function resolveModelChunk(chunk, value) {
  if (chunk.status !== PENDING) {
    // We already resolved. We didn't expect to see this.
    return;
  }

  const resolveListeners = chunk.value;
  const rejectListeners = chunk.reason;
  const resolvedChunk = chunk;
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

function bindArgs$1(fn, args) {
  return fn.bind.apply(fn, [null].concat(args));
}

function loadServerReference$1(response, id, bound, parentChunk, parentObject, key) {
  const serverReference = resolveServerReference(response._bundlerConfig, id); // We expect most servers to not really need this because you'd just have all
  // the relevant modules already loaded but it allows for lazy loading of code
  // if needed.

  const preloadPromise = preloadModule(serverReference);
  let promise;

  if (bound) {
    promise = Promise.all([bound, preloadPromise]).then((_ref) => {
      let args = _ref[0];
      return bindArgs$1(requireModule(serverReference), args);
    });
  } else {
    if (preloadPromise) {
      promise = Promise.resolve(preloadPromise).then(() => requireModule(serverReference));
    } else {
      // Synchronously available
      return requireModule(serverReference);
    }
  }

  promise.then(createModelResolver(parentChunk, parentObject, key), createModelReject(parentChunk)); // We need a placeholder value that will be replaced later.

  return null;
}

let initializingChunk = null;
let initializingChunkBlockedModel = null;

function initializeModelChunk(chunk) {
  const prevChunk = initializingChunk;
  const prevBlocked = initializingChunkBlockedModel;
  initializingChunk = chunk;
  initializingChunkBlockedModel = null;

  try {
    const value = JSON.parse(chunk.value, chunk._response._fromJSON);

    if (initializingChunkBlockedModel !== null && initializingChunkBlockedModel.deps > 0) {
      initializingChunkBlockedModel.value = value; // We discovered new dependencies on modules that are not yet resolved.
      // We have to go the BLOCKED state until they're resolved.

      const blockedChunk = chunk;
      blockedChunk.status = BLOCKED;
      blockedChunk.value = null;
      blockedChunk.reason = null;
    } else {
      const initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = value;
    }
  } catch (error) {
    const erroredChunk = chunk;
    erroredChunk.status = ERRORED;
    erroredChunk.reason = error;
  } finally {
    initializingChunk = prevChunk;
    initializingChunkBlockedModel = prevBlocked;
  }
} // Report that any missing chunks in the model is now going to throw this
// error upon read. Also notify any pending promises.


function reportGlobalError(response, error) {
  response._chunks.forEach(chunk => {
    // If this chunk was already resolved or errored, it won't
    // trigger an error but if it wasn't then we need to
    // because we won't be getting any new data to resolve it.
    if (chunk.status === PENDING) {
      triggerErrorOnChunk(chunk, error);
    }
  });
}

function getChunk(response, id) {
  const chunks = response._chunks;
  let chunk = chunks.get(id);

  if (!chunk) {
    const prefix = response._prefix;
    const key = prefix + id; // Check if we have this field in the backing store already.

    const backingEntry = response._formData.get(key);

    if (backingEntry != null) {
      // We assume that this is a string entry for now.
      chunk = createResolvedModelChunk(response, backingEntry);
    } else {
      // We're still waiting on this entry to stream in.
      chunk = createPendingChunk(response);
    }

    chunks.set(id, chunk);
  }

  return chunk;
}

function createModelResolver(chunk, parentObject, key) {
  let blocked;

  if (initializingChunkBlockedModel) {
    blocked = initializingChunkBlockedModel;
    blocked.deps++;
  } else {
    blocked = initializingChunkBlockedModel = {
      deps: 1,
      value: null
    };
  }

  return value => {
    parentObject[key] = value;
    blocked.deps--;

    if (blocked.deps === 0) {
      if (chunk.status !== BLOCKED) {
        return;
      }

      const resolveListeners = chunk.value;
      const initializedChunk = chunk;
      initializedChunk.status = INITIALIZED;
      initializedChunk.value = blocked.value;

      if (resolveListeners !== null) {
        wakeChunk(resolveListeners, blocked.value);
      }
    }
  };
}

function createModelReject(chunk) {
  return error => triggerErrorOnChunk(chunk, error);
}

function getOutlinedModel(response, id) {
  const chunk = getChunk(response, id);

  if (chunk.status === RESOLVED_MODEL) {
    initializeModelChunk(chunk);
  }

  if (chunk.status !== INITIALIZED) {
    // We know that this is emitted earlier so otherwise it's an error.
    throw chunk.reason;
  }

  return chunk.value;
}

function parseModelString(response, parentObject, key, value) {
  if (value[0] === '$') {
    switch (value[1]) {
      case '$':
        {
          // This was an escaped string value.
          return value.slice(1);
        }

      case '@':
        {
          // Promise
          const id = parseInt(value.slice(2), 16);
          const chunk = getChunk(response, id);
          return chunk;
        }

      case 'S':
        {
          // Symbol
          return Symbol.for(value.slice(2));
        }

      case 'F':
        {
          // Server Reference
          const id = parseInt(value.slice(2), 16); // TODO: Just encode this in the reference inline instead of as a model.

          const metaData = getOutlinedModel(response, id);
          return loadServerReference$1(response, metaData.id, metaData.bound, initializingChunk, parentObject, key);
        }

      case 'Q':
        {
          // Map
          const id = parseInt(value.slice(2), 16);
          const data = getOutlinedModel(response, id);
          return new Map(data);
        }

      case 'W':
        {
          // Set
          const id = parseInt(value.slice(2), 16);
          const data = getOutlinedModel(response, id);
          return new Set(data);
        }

      case 'K':
        {
          // FormData
          const stringId = value.slice(2);
          const formPrefix = response._prefix + stringId + '_';
          const data = new FormData();
          const backingFormData = response._formData; // We assume that the reference to FormData always comes after each
          // entry that it references so we can assume they all exist in the
          // backing store already.
          // $FlowFixMe[prop-missing] FormData has forEach on it.

          backingFormData.forEach((entry, entryKey) => {
            if (entryKey.startsWith(formPrefix)) {
              data.append(entryKey.slice(formPrefix.length), entry);
            }
          });
          return data;
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
          const id = parseInt(value.slice(1), 16);
          const chunk = getChunk(response, id);

          switch (chunk.status) {
            case RESOLVED_MODEL:
              initializeModelChunk(chunk);
              break;
          } // The status might have changed after initialization.


          switch (chunk.status) {
            case INITIALIZED:
              return chunk.value;

            case PENDING:
            case BLOCKED:
              const parentChunk = initializingChunk;
              chunk.then(createModelResolver(parentChunk, parentObject, key), createModelReject(parentChunk));
              return null;

            default:
              throw chunk.reason;
          }
        }
    }
  }

  return value;
}

function createResponse(bundlerConfig, formFieldPrefix) {
  let backingFormData = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : new FormData();
  const chunks = new Map();
  const response = {
    _bundlerConfig: bundlerConfig,
    _prefix: formFieldPrefix,
    _formData: backingFormData,
    _chunks: chunks,
    _fromJSON: function (key, value) {
      if (typeof value === 'string') {
        // We can't use .bind here because we need the "this" value.
        return parseModelString(response, this, key, value);
      }

      return value;
    }
  };
  return response;
}
function resolveField(response, key, value) {
  // Add this field to the backing store.
  response._formData.append(key, value);

  const prefix = response._prefix;

  if (key.startsWith(prefix)) {
    const chunks = response._chunks;
    const id = +key.slice(prefix.length);
    const chunk = chunks.get(id);

    if (chunk) {
      // We were waiting on this key so now we can resolve it.
      resolveModelChunk(chunk, value);
    }
  }
}
function resolveFileInfo(response, key, filename, mime) {
  return {
    chunks: [],
    filename,
    mime
  };
}
function resolveFileChunk(response, handle, chunk) {
  handle.chunks.push(chunk);
}
function resolveFileComplete(response, key, handle) {
  // Add this file to the backing store.
  // Node.js doesn't expose a global File constructor so we need to use
  // the append() form that takes the file name as the third argument,
  // to create a File object.
  const blob = new Blob(handle.chunks, {
    type: handle.mime
  });

  response._formData.append(key, blob, handle.filename);
}
function close(response) {
  // In case there are any remaining unresolved chunks, they won't
  // be resolved now. So we need to issue an error to those.
  // Ideally we should be able to early bail out if we kept a
  // ref count of pending chunks.
  reportGlobalError(response, new Error('Connection closed.'));
}

function bindArgs(fn, args) {
  return fn.bind.apply(fn, [null].concat(args));
}

function loadServerReference(bundlerConfig, id, bound) {
  const serverReference = resolveServerReference(bundlerConfig, id); // We expect most servers to not really need this because you'd just have all
  // the relevant modules already loaded but it allows for lazy loading of code
  // if needed.

  const preloadPromise = preloadModule(serverReference);

  if (bound) {
    return Promise.all([bound, preloadPromise]).then((_ref) => {
      let args = _ref[0];
      return bindArgs(requireModule(serverReference), args);
    });
  } else if (preloadPromise) {
    return Promise.resolve(preloadPromise).then(() => requireModule(serverReference));
  } else {
    // Synchronously available
    return Promise.resolve(requireModule(serverReference));
  }
}

function decodeBoundActionMetaData(body, serverManifest, formFieldPrefix) {
  // The data for this reference is encoded in multiple fields under this prefix.
  const actionResponse = createResponse(serverManifest, formFieldPrefix, body);
  close(actionResponse);
  const refPromise = getRoot(actionResponse); // Force it to initialize
  // $FlowFixMe

  refPromise.then(() => {});

  if (refPromise.status !== 'fulfilled') {
    // $FlowFixMe
    throw refPromise.reason;
  }

  return refPromise.value;
}

function decodeAction(body, serverManifest) {
  // We're going to create a new formData object that holds all the fields except
  // the implementation details of the action data.
  const formData = new FormData();
  let action = null; // $FlowFixMe[prop-missing]

  body.forEach((value, key) => {
    if (!key.startsWith('$ACTION_')) {
      formData.append(key, value);
      return;
    } // Later actions may override earlier actions if a button is used to override the default
    // form action.


    if (key.startsWith('$ACTION_REF_')) {
      const formFieldPrefix = '$ACTION_' + key.slice(12) + ':';
      const metaData = decodeBoundActionMetaData(body, serverManifest, formFieldPrefix);
      action = loadServerReference(serverManifest, metaData.id, metaData.bound);
      return;
    }

    if (key.startsWith('$ACTION_ID_')) {
      const id = key.slice(11);
      action = loadServerReference(serverManifest, id, null);
      return;
    }
  });

  if (action === null) {
    return null;
  } // Return the action with the remaining FormData bound to the first argument.


  return action.then(fn => fn.bind(null, formData));
}
function decodeFormState(actionResult, body, serverManifest) {
  const keyPath = body.get('$ACTION_KEY');

  if (typeof keyPath !== 'string') {
    // This form submission did not include any form state.
    return Promise.resolve(null);
  } // Search through the form data object to get the reference id and the number
  // of bound arguments. This repeats some of the work done in decodeAction.


  let metaData = null; // $FlowFixMe[prop-missing]

  body.forEach((value, key) => {
    if (key.startsWith('$ACTION_REF_')) {
      const formFieldPrefix = '$ACTION_' + key.slice(12) + ':';
      metaData = decodeBoundActionMetaData(body, serverManifest, formFieldPrefix);
    } // We don't check for the simple $ACTION_ID_ case because form state actions
    // are always bound to the state argument.

  });

  if (metaData === null) {
    // Should be unreachable.
    return Promise.resolve(null);
  }

  const referenceId = metaData.id;
  return Promise.resolve(metaData.bound).then(bound => {
    if (bound === null) {
      // Should be unreachable because form state actions are always bound to the
      // state argument.
      return null;
    } // The form action dispatch method is always bound to the initial state.
    // But when comparing signatures, we compare to the original unbound action.
    // Subtract one from the arity to account for this.


    const boundArity = bound.length - 1;
    return [actionResult, keyPath, referenceId, boundArity];
  });
}

function createDrainHandler(destination, request) {
  return () => startFlowing(request, destination);
}

function createCancelHandler(request, reason) {
  return () => {
    stopFlowing(request); // eslint-disable-next-line react-internal/prod-error-codes

    abort(request, new Error(reason));
  };
}

function renderToPipeableStream(model, webpackMap, options) {
  const request = createRequest(model, webpackMap, options ? options.onError : undefined, options ? options.identifierPrefix : undefined, options ? options.onPostpone : undefined);
  let hasStartedFlowing = false;
  startWork(request);
  return {
    pipe(destination) {
      if (hasStartedFlowing) {
        throw new Error('React currently only supports piping to one writable stream.');
      }

      hasStartedFlowing = true;
      startFlowing(request, destination);
      destination.on('drain', createDrainHandler(destination, request));
      destination.on('error', createCancelHandler(request, 'The destination stream errored while writing data.'));
      destination.on('close', createCancelHandler(request, 'The destination stream closed early.'));
      return destination;
    },

    abort(reason) {
      abort(request, reason);
    }

  };
}

function decodeReplyFromBusboy(busboyStream, webpackMap) {
  const response = createResponse(webpackMap, '');
  let pendingFiles = 0;
  const queuedFields = [];
  busboyStream.on('field', (name, value) => {
    if (pendingFiles > 0) {
      // Because the 'end' event fires two microtasks after the next 'field'
      // we would resolve files and fields out of order. To handle this properly
      // we queue any fields we receive until the previous file is done.
      queuedFields.push(name, value);
    } else {
      resolveField(response, name, value);
    }
  });
  busboyStream.on('file', (name, value, _ref) => {
    let filename = _ref.filename,
        encoding = _ref.encoding,
        mimeType = _ref.mimeType;

    if (encoding.toLowerCase() === 'base64') {
      throw new Error("React doesn't accept base64 encoded file uploads because we don't expect " + "form data passed from a browser to ever encode data that way. If that's " + 'the wrong assumption, we can easily fix it.');
    }

    pendingFiles++;
    const file = resolveFileInfo(response, name, filename, mimeType);
    value.on('data', chunk => {
      resolveFileChunk(response, file, chunk);
    });
    value.on('end', () => {
      resolveFileComplete(response, name, file);
      pendingFiles--;

      if (pendingFiles === 0) {
        // Release any queued fields
        for (let i = 0; i < queuedFields.length; i += 2) {
          resolveField(response, queuedFields[i], queuedFields[i + 1]);
        }

        queuedFields.length = 0;
      }
    });
  });
  busboyStream.on('finish', () => {
    close(response);
  });
  busboyStream.on('error', err => {
    reportGlobalError(response, // $FlowFixMe[incompatible-call] types Error and mixed are incompatible
    err);
  });
  return getRoot(response);
}

function decodeReply(body, webpackMap) {
  if (typeof body === 'string') {
    const form = new FormData();
    form.append('0', body);
    body = form;
  }

  const response = createResponse(webpackMap, '', body);
  const root = getRoot(response);
  close(response);
  return root;
}

exports.createClientModuleProxy = createClientModuleProxy;
exports.decodeAction = decodeAction;
exports.decodeFormState = decodeFormState;
exports.decodeReply = decodeReply;
exports.decodeReplyFromBusboy = decodeReplyFromBusboy;
exports.registerClientReference = registerClientReference;
exports.registerServerReference = registerServerReference;
exports.renderToPipeableStream = renderToPipeableStream;