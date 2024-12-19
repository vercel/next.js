/**
 * @license React
 * react.react-server.production.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const assign = Object.assign;

// -----------------------------------------------------------------------------
// Ready for next major.
//
// Alias __NEXT_MAJOR__ to true for easier skimming.
// -----------------------------------------------------------------------------

const __NEXT_MAJOR__ = true; // Not ready to break experimental yet.
// as a normal prop instead of stripping it from the props object.
// Passes `ref` as a normal prop instead of stripping it from the props object
// during element creation.

const enableRefAsProp = __NEXT_MAJOR__; // Not ready to break experimental yet.

/**
 * Keeps track of the current Cache dispatcher.
 */
const ReactCurrentCache = {
  current: null
};

function createFetchCache() {
  return new Map();
}

const simpleCacheKey = '["GET",[],null,"follow",null,null,null,null]'; // generateCacheKey(new Request('https://blank'));

function generateCacheKey(request) {
  // We pick the fields that goes into the key used to dedupe requests.
  // We don't include the `cache` field, because we end up using whatever
  // caching resulted from the first request.
  // Notably we currently don't consider non-standard (or future) options.
  // This might not be safe. TODO: warn for non-standard extensions differing.
  // IF YOU CHANGE THIS UPDATE THE simpleCacheKey ABOVE.
  return JSON.stringify([request.method, Array.from(request.headers.entries()), request.mode, request.redirect, request.credentials, request.referrer, request.referrerPolicy, request.integrity]);
}

{
  if (typeof fetch === 'function') {
    const originalFetch = fetch;

    const cachedFetch = function fetch(resource, options) {
      const dispatcher = ReactCurrentCache.current;

      if (!dispatcher) {
        // We're outside a cached scope.
        return originalFetch(resource, options);
      }

      if (options && options.signal && options.signal !== dispatcher.getCacheSignal()) {
        // If we're passed a signal that is not ours, then we assume that
        // someone else controls the lifetime of this object and opts out of
        // caching. It's effectively the opt-out mechanism.
        // Ideally we should be able to check this on the Request but
        // it always gets initialized with its own signal so we don't
        // know if it's supposed to override - unless we also override the
        // Request constructor.
        return originalFetch(resource, options);
      } // Normalize the Request


      let url;
      let cacheKey;

      if (typeof resource === 'string' && !options) {
        // Fast path.
        cacheKey = simpleCacheKey;
        url = resource;
      } else {
        // Normalize the request.
        // if resource is not a string or a URL (its an instance of Request)
        // then do not instantiate a new Request but instead
        // reuse the request as to not disturb the body in the event it's a ReadableStream.
        const request = typeof resource === 'string' || resource instanceof URL ? new Request(resource, options) : resource;

        if (request.method !== 'GET' && request.method !== 'HEAD' || // $FlowFixMe[prop-missing]: keepalive is real
        request.keepalive) {
          // We currently don't dedupe requests that might have side-effects. Those
          // have to be explicitly cached. We assume that the request doesn't have a
          // body if it's GET or HEAD.
          // keepalive gets treated the same as if you passed a custom cache signal.
          return originalFetch(resource, options);
        }

        cacheKey = generateCacheKey(request);
        url = request.url;
      }

      const cache = dispatcher.getCacheForType(createFetchCache);
      const cacheEntries = cache.get(url);
      let match;

      if (cacheEntries === undefined) {
        // We pass the original arguments here in case normalizing the Request
        // doesn't include all the options in this environment.
        match = originalFetch(resource, options);
        cache.set(url, [cacheKey, match]);
      } else {
        // We use an array as the inner data structure since it's lighter and
        // we typically only expect to see one or two entries here.
        for (let i = 0, l = cacheEntries.length; i < l; i += 2) {
          const key = cacheEntries[i];
          const value = cacheEntries[i + 1];

          if (key === cacheKey) {
            match = value; // I would've preferred a labelled break but lint says no.

            return match.then(response => response.clone());
          }
        }

        match = originalFetch(resource, options);
        cacheEntries.push(cacheKey, match);
      } // We clone the response so that each time you call this you get a new read
      // of the body so that it can be read multiple times.


      return match.then(response => response.clone());
    }; // We don't expect to see any extra properties on fetch but if there are any,
    // copy them over. Useful for extended fetch environments or mocks.


    assign(cachedFetch, originalFetch);

    try {
      // eslint-disable-next-line no-native-reassign
      fetch = cachedFetch;
    } catch (error1) {
      try {
        // In case assigning it globally fails, try globalThis instead just in case it exists.
        globalThis.fetch = cachedFetch;
      } catch (error2) {
        // Log even in production just to make sure this is seen if only prod is frozen.
        // eslint-disable-next-line react-internal/no-production-logging
        console.warn('React was unable to patch the fetch() function in this environment. ' + 'Suspensey APIs might not work correctly as a result.');
      }
    }
  }
}

/**
 * Keeps track of the current dispatcher.
 */
const ReactCurrentDispatcher = {
  current: null
};

/**
 * Keeps track of the current owner.
 *
 * The current owner is the component who should own any components that are
 * currently being constructed.
 */
const ReactCurrentOwner$1 = {
  /**
   * @internal
   * @type {ReactComponent}
   */
  current: null
};

const ReactSharedInternals = {
  ReactCurrentDispatcher,
  ReactCurrentOwner: ReactCurrentOwner$1
};

const TaintRegistryObjects$1 = new WeakMap();
const TaintRegistryValues$1 = new Map(); // Byte lengths of all binary values we've ever seen. We don't both refcounting this.
// We expect to see only a few lengths here such as the length of token.

const TaintRegistryByteLengths$1 = new Set(); // When a value is finalized, it means that it has been removed from any global caches.
// No future requests can get a handle on it but any ongoing requests can still have
// a handle on it. It's still tainted until that happens.

const TaintRegistryPendingRequests$1 = new Set();

const ReactServerSharedInternals = {
  ReactCurrentCache
};

{
  ReactServerSharedInternals.TaintRegistryObjects = TaintRegistryObjects$1;
  ReactServerSharedInternals.TaintRegistryValues = TaintRegistryValues$1;
  ReactServerSharedInternals.TaintRegistryByteLengths = TaintRegistryByteLengths$1;
  ReactServerSharedInternals.TaintRegistryPendingRequests = TaintRegistryPendingRequests$1;
}

// Do not require this module directly! Use normal `invariant` calls with
// template literal strings. The messages will be replaced with error codes
// during build.
function formatProdErrorMessage(code) {
  let url = 'https://react.dev/errors/' + code;

  if (arguments.length > 1) {
    url += '?args[]=' + encodeURIComponent(arguments[1]);

    for (let i = 2; i < arguments.length; i++) {
      url += '&args[]=' + encodeURIComponent(arguments[i]);
    }
  }

  return "Minified React error #" + code + "; visit " + url + " for the full message or " + 'use the non-minified dev environment for full errors and additional ' + 'helpful warnings.';
}

const isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_PORTAL_TYPE = Symbol.for('react.portal');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
const REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
const REACT_PROFILER_TYPE = Symbol.for('react.profiler');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
const REACT_MEMO_TYPE = Symbol.for('react.memo');
const REACT_LAZY_TYPE = Symbol.for('react.lazy');
const REACT_DEBUG_TRACING_MODE_TYPE = Symbol.for('react.debug_trace_mode');
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

// $FlowFixMe[method-unbinding]
const hasOwnProperty = Object.prototype.hasOwnProperty;

const ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;

function hasValidRef(config) {

  return config.ref !== undefined;
}

function hasValidKey(config) {

  return config.key !== undefined;
}
/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
 * if something is a React Element.
 *
 * @param {*} type
 * @param {*} props
 * @param {*} key
 * @param {string|object} ref
 * @param {*} owner
 * @param {*} self A *temporary* helper to detect places where `this` is
 * different from the `owner` when React.createElement is called, so that we
 * can warn. We want to get rid of owner and replace string `ref`s with arrow
 * functions, and as long as `this` and owner are the same, there will be no
 * change in behavior.
 * @param {*} source An annotation object (added by a transpiler or otherwise)
 * indicating filename, line number, and/or other information.
 * @internal
 */


function ReactElement(type, key, _ref, self, source, owner, props) {
  let ref;

  {
    // When enableRefAsProp is on, ignore whatever was passed as the ref
    // argument and treat `props.ref` as the source of truth. The only thing we
    // use this for is `element.ref`, which will log a deprecation warning on
    // access. In the next release, we can remove `element.ref` as well as the
    // `ref` argument.
    const refProp = props.ref; // An undefined `element.ref` is coerced to `null` for
    // backwards compatibility.

    ref = refProp !== undefined ? refProp : null;
  }

  let element;

  {
    // In prod, `ref` is a regular property. It will be removed in a
    // future release.
    element = {
      // This tag allows us to uniquely identify this as a React Element
      $$typeof: REACT_ELEMENT_TYPE,
      // Built-in properties that belong on the element
      type,
      key,
      ref,
      props,
      // Record the component responsible for creating this element.
      _owner: owner
    };
  }

  return element;
}
/**
 * Create and return a new ReactElement of the given type.
 * See https://reactjs.org/docs/react-api.html#createelement
 */

function createElement(type, config, children) {

  let propName; // Reserved names are extracted

  const props = {};
  let key = null;
  let ref = null;

  if (config != null) {

    if (hasValidKey(config)) {

      key = '' + config.key;
    } // Remaining properties are added to a new props object


    for (propName in config) {
      if (hasOwnProperty.call(config, propName) && // Skip over reserved prop names
      propName !== 'key' && (enableRefAsProp ) && // Even though we don't use these anymore in the runtime, we don't want
      // them to appear as props, so in createElement we filter them out.
      // We don't have to do this in the jsx() runtime because the jsx()
      // transform never passed these as props; it used separate arguments.
      propName !== '__self' && propName !== '__source') {
        props[propName] = config[propName];
      }
    }
  } // Children can be more than one argument, and those are transferred onto
  // the newly allocated props object.


  const childrenLength = arguments.length - 2;

  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    const childArray = Array(childrenLength);

    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }

    props.children = childArray;
  } // Resolve default props


  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;

    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  const element = ReactElement(type, key, ref, undefined, undefined, ReactCurrentOwner.current, props);

  return element;
}
function cloneAndReplaceKey(oldElement, newKey) {
  return ReactElement(oldElement.type, newKey, // When enableRefAsProp is on, this argument is ignored. This check only
  // exists to avoid the `ref` access warning.
  null , undefined, undefined, oldElement._owner, oldElement.props);
}
/**
 * Clone and return a new ReactElement using element as the starting point.
 * See https://reactjs.org/docs/react-api.html#cloneelement
 */

function cloneElement(element, config, children) {
  if (element === null || element === undefined) {
    throw Error(formatProdErrorMessage(267, element));
  }

  let propName; // Original props are copied

  const props = assign({}, element.props); // Reserved names are extracted

  let key = element.key;
  let ref = null ; // Owner will be preserved, unless ref is overridden

  let owner = element._owner;

  if (config != null) {
    if (hasValidRef(config)) {

      owner = ReactCurrentOwner.current;
    }

    if (hasValidKey(config)) {

      key = '' + config.key;
    } // Remaining properties override existing props


    let defaultProps;

    if (element.type && element.type.defaultProps) {
      defaultProps = element.type.defaultProps;
    }

    for (propName in config) {
      if (hasOwnProperty.call(config, propName) && // Skip over reserved prop names
      propName !== 'key' && (enableRefAsProp ) && // ...and maybe these, too, though we currently rely on them for
      // warnings and debug information in dev. Need to decide if we're OK
      // with dropping them. In the jsx() runtime it's not an issue because
      // the data gets passed as separate arguments instead of props, but
      // it would be nice to stop relying on them entirely so we can drop
      // them from the internal Fiber field.
      propName !== '__self' && propName !== '__source' && // Undefined `ref` is ignored by cloneElement. We treat it the same as
      // if the property were missing. This is mostly for
      // backwards compatibility.
      !(propName === 'ref' && config.ref === undefined)) {
        if (config[propName] === undefined && defaultProps !== undefined) {
          // Resolve default props
          props[propName] = defaultProps[propName];
        } else {
          props[propName] = config[propName];
        }
      }
    }
  } // Children can be more than one argument, and those are transferred onto
  // the newly allocated props object.


  const childrenLength = arguments.length - 2;

  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    const childArray = Array(childrenLength);

    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }

    props.children = childArray;
  }

  const clonedElement = ReactElement(element.type, key, ref, undefined, undefined, owner, props);

  return clonedElement;
}
/**
 * Verifies the object is a ReactElement.
 * See https://reactjs.org/docs/react-api.html#isvalidelement
 * @param {?object} object
 * @return {boolean} True if `object` is a ReactElement.
 * @final
 */


function isValidElement(object) {
  return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
}

const SEPARATOR = '.';
const SUBSEPARATOR = ':';
/**
 * Escape and wrap key so it is safe to use as a reactid
 *
 * @param {string} key to be escaped.
 * @return {string} the escaped key.
 */

function escape(key) {
  const escapeRegex = /[=:]/g;
  const escaperLookup = {
    '=': '=0',
    ':': '=2'
  };
  const escapedString = key.replace(escapeRegex, function (match) {
    return escaperLookup[match];
  });
  return '$' + escapedString;
}
const userProvidedKeyEscapeRegex = /\/+/g;

function escapeUserProvidedKey(text) {
  return text.replace(userProvidedKeyEscapeRegex, '$&/');
}
/**
 * Generate a key string that identifies a element within a set.
 *
 * @param {*} element A element that could contain a manual key.
 * @param {number} index Index that is used if a manual key is not provided.
 * @return {string}
 */


function getElementKey(element, index) {
  // Do some typechecking here since we call this blindly. We want to ensure
  // that we don't block potential future ES APIs.
  if (typeof element === 'object' && element !== null && element.key != null) {

    return escape('' + element.key);
  } // Implicit key determined by the index in the set


  return index.toString(36);
}

function noop$1() {}

function resolveThenable(thenable) {
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
        if (typeof thenable.status === 'string') {
          // Only instrument the thenable if the status if not defined. If
          // it's defined, but an unknown value, assume it's been instrumented by
          // some custom userspace implementation. We treat it as "pending".
          // Attach a dummy listener, to ensure that any lazy initialization can
          // happen. Flight lazily parses JSON when the value is actually awaited.
          thenable.then(noop$1, noop$1);
        } else {
          // This is an uncached thenable that we haven't seen before.
          // TODO: Detect infinite ping loops caused by uncached promises.
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
        } // Check one more time in case the thenable resolved synchronously.


        switch (thenable.status) {
          case 'fulfilled':
            {
              const fulfilledThenable = thenable;
              return fulfilledThenable.value;
            }

          case 'rejected':
            {
              const rejectedThenable = thenable;
              const rejectedError = rejectedThenable.reason;
              throw rejectedError;
            }
        }
      }
  }

  throw thenable;
}

function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
  const type = typeof children;

  if (type === 'undefined' || type === 'boolean') {
    // All of the above are perceived as null.
    children = null;
  }

  let invokeCallback = false;

  if (children === null) {
    invokeCallback = true;
  } else {
    switch (type) {
      case 'string':
      case 'number':
        invokeCallback = true;
        break;

      case 'object':
        switch (children.$$typeof) {
          case REACT_ELEMENT_TYPE:
          case REACT_PORTAL_TYPE:
            invokeCallback = true;
            break;

          case REACT_LAZY_TYPE:
            const payload = children._payload;
            const init = children._init;
            return mapIntoArray(init(payload), array, escapedPrefix, nameSoFar, callback);
        }

    }
  }

  if (invokeCallback) {
    const child = children;
    let mappedChild = callback(child); // If it's the only child, treat the name as if it was wrapped in an array
    // so that it's consistent if the number of children grows:

    const childKey = nameSoFar === '' ? SEPARATOR + getElementKey(child, 0) : nameSoFar;

    if (isArray(mappedChild)) {
      let escapedChildKey = '';

      if (childKey != null) {
        escapedChildKey = escapeUserProvidedKey(childKey) + '/';
      }

      mapIntoArray(mappedChild, array, escapedChildKey, '', c => c);
    } else if (mappedChild != null) {
      if (isValidElement(mappedChild)) {

        mappedChild = cloneAndReplaceKey(mappedChild, // Keep both the (mapped) and old keys if they differ, just as
        // traverseAllChildren used to do for objects as children
        escapedPrefix + ( // $FlowFixMe[incompatible-type] Flow incorrectly thinks React.Portal doesn't have a key
        mappedChild.key && (!child || child.key !== mappedChild.key) ? escapeUserProvidedKey( // $FlowFixMe[unsafe-addition]
        '' + mappedChild.key // eslint-disable-line react-internal/safe-string-coercion
        ) + '/' : '') + childKey);
      }

      array.push(mappedChild);
    }

    return 1;
  }

  let child;
  let nextName;
  let subtreeCount = 0; // Count of children found in the current subtree.

  const nextNamePrefix = nameSoFar === '' ? SEPARATOR : nameSoFar + SUBSEPARATOR;

  if (isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      child = children[i];
      nextName = nextNamePrefix + getElementKey(child, i);
      subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
    }
  } else {
    const iteratorFn = getIteratorFn(children);

    if (typeof iteratorFn === 'function') {
      const iterableChildren = children;

      const iterator = iteratorFn.call(iterableChildren);
      let step;
      let ii = 0; // $FlowFixMe[incompatible-use] `iteratorFn` might return null according to typing.

      while (!(step = iterator.next()).done) {
        child = step.value;
        nextName = nextNamePrefix + getElementKey(child, ii++);
        subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
      }
    } else if (type === 'object') {
      if (typeof children.then === 'function') {
        return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
      } // eslint-disable-next-line react-internal/safe-string-coercion


      const childrenString = String(children);
      throw Error(formatProdErrorMessage(31, childrenString === '[object Object]' ? 'object with keys {' + Object.keys(children).join(', ') + '}' : childrenString));
    }
  }

  return subtreeCount;
}
/**
 * Maps children that are typically specified as `props.children`.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenmap
 *
 * The provided mapFunction(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} func The map function.
 * @param {*} context Context for mapFunction.
 * @return {object} Object containing the ordered map of results.
 */


function mapChildren(children, func, context) {
  if (children == null) {
    // $FlowFixMe limitation refining abstract types in Flow
    return children;
  }

  const result = [];
  let count = 0;
  mapIntoArray(children, result, '', '', function (child) {
    return func.call(context, child, count++);
  });
  return result;
}
/**
 * Count the number of children that are typically specified as
 * `props.children`.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrencount
 *
 * @param {?*} children Children tree container.
 * @return {number} The number of children.
 */


function countChildren(children) {
  let n = 0;
  mapChildren(children, () => {
    n++; // Don't return anything
  });
  return n;
}
/**
 * Iterates through children that are typically specified as `props.children`.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenforeach
 *
 * The provided forEachFunc(child, index) will be called for each
 * leaf child.
 *
 * @param {?*} children Children tree container.
 * @param {function(*, int)} forEachFunc
 * @param {*} forEachContext Context for forEachContext.
 */


function forEachChildren(children, forEachFunc, forEachContext) {
  mapChildren(children, // $FlowFixMe[missing-this-annot]
  function () {
    forEachFunc.apply(this, arguments); // Don't return anything.
  }, forEachContext);
}
/**
 * Flatten a children object (typically specified as `props.children`) and
 * return an array with appropriately re-keyed children.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrentoarray
 */


function toArray(children) {
  return mapChildren(children, child => child) || [];
}
/**
 * Returns the first child in a collection of children and verifies that there
 * is only one child in the collection.
 *
 * See https://reactjs.org/docs/react-api.html#reactchildrenonly
 *
 * The current implementation of this function assumes that a single child gets
 * passed without a wrapper, but the purpose of this helper function is to
 * abstract away the particular structure of children.
 *
 * @param {?object} children Child collection structure.
 * @return {ReactElement} The first and only `ReactElement` contained in the
 * structure.
 */


function onlyChild(children) {
  if (!isValidElement(children)) {
    throw Error(formatProdErrorMessage(143));
  }

  return children;
}

// an immutable object with a single mutable value
function createRef() {
  const refObject = {
    current: null
  };

  return refObject;
}

function resolveDispatcher() {
  const dispatcher = ReactCurrentDispatcher.current;
  // intentionally don't throw our own error because this is in a hot path.
  // Also helps ensure this is inlined.


  return dispatcher;
}

function getCacheSignal() {
  const dispatcher = ReactCurrentCache.current;

  if (!dispatcher) {
    // If we have no cache to associate with this call, then we don't know
    // its lifetime. We abort early since that's safer than letting it live
    // for ever. Unlike just caching which can be a functional noop outside
    // of React, these should generally always be associated with some React
    // render but we're not limiting quite as much as making it a Hook.
    // It's safer than erroring early at runtime.
    const controller = new AbortController();
    const reason = Error(formatProdErrorMessage(455));
    controller.abort(reason);
    return controller.signal;
  }

  return dispatcher.getCacheSignal();
}
function getCacheForType(resourceType) {
  const dispatcher = ReactCurrentCache.current;

  if (!dispatcher) {
    // If there is no dispatcher, then we treat this as not being cached.
    return resourceType();
  }

  return dispatcher.getCacheForType(resourceType);
}
function useCallback(callback, deps) {
  const dispatcher = resolveDispatcher();
  return dispatcher.useCallback(callback, deps);
}
function useMemo(create, deps) {
  const dispatcher = resolveDispatcher();
  return dispatcher.useMemo(create, deps);
}
function useDebugValue(value, formatterFn) {
}
function useId() {
  const dispatcher = resolveDispatcher();
  return dispatcher.useId();
}
function use(usable) {
  const dispatcher = resolveDispatcher();
  return dispatcher.use(usable);
}

function forwardRef(render) {

  const elementType = {
    $$typeof: REACT_FORWARD_REF_TYPE,
    render
  };

  return elementType;
}

const Uninitialized = -1;
const Pending = 0;
const Resolved = 1;
const Rejected = 2;

function lazyInitializer(payload) {
  if (payload._status === Uninitialized) {
    const ctor = payload._result;
    const thenable = ctor(); // Transition to the next state.
    // This might throw either because it's missing or throws. If so, we treat it
    // as still uninitialized and try again next time. Which is the same as what
    // happens if the ctor or any wrappers processing the ctor throws. This might
    // end up fixing it if the resolution was a concurrency bug.

    thenable.then(moduleObject => {
      if (payload._status === Pending || payload._status === Uninitialized) {
        // Transition to the next state.
        const resolved = payload;
        resolved._status = Resolved;
        resolved._result = moduleObject;
      }
    }, error => {
      if (payload._status === Pending || payload._status === Uninitialized) {
        // Transition to the next state.
        const rejected = payload;
        rejected._status = Rejected;
        rejected._result = error;
      }
    });

    if (payload._status === Uninitialized) {
      // In case, we're still uninitialized, then we're waiting for the thenable
      // to resolve. Set it as pending in the meantime.
      const pending = payload;
      pending._status = Pending;
      pending._result = thenable;
    }
  }

  if (payload._status === Resolved) {
    const moduleObject = payload._result;

    return moduleObject.default;
  } else {
    throw payload._result;
  }
}

function lazy(ctor) {
  const payload = {
    // We use these fields to store the result.
    _status: Uninitialized,
    _result: ctor
  };
  const lazyType = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: payload,
    _init: lazyInitializer
  };

  return lazyType;
}

function memo(type, compare) {

  const elementType = {
    $$typeof: REACT_MEMO_TYPE,
    type,
    compare: compare === undefined ? null : compare
  };

  return elementType;
}

const UNTERMINATED = 0;
const TERMINATED = 1;
const ERRORED = 2;

function createCacheRoot() {
  return new WeakMap();
}

function createCacheNode() {
  return {
    s: UNTERMINATED,
    // status, represents whether the cached computation returned a value or threw an error
    v: undefined,
    // value, either the cached result or an error, depending on s
    o: null,
    // object cache, a WeakMap where non-primitive arguments are stored
    p: null // primitive cache, a regular Map where primitive arguments are stored.

  };
}

function cache(fn) {
  return function () {
    const dispatcher = ReactCurrentCache.current;

    if (!dispatcher) {
      // If there is no dispatcher, then we treat this as not being cached.
      // $FlowFixMe[incompatible-call]: We don't want to use rest arguments since we transpile the code.
      return fn.apply(null, arguments);
    }

    const fnMap = dispatcher.getCacheForType(createCacheRoot);
    const fnNode = fnMap.get(fn);
    let cacheNode;

    if (fnNode === undefined) {
      cacheNode = createCacheNode();
      fnMap.set(fn, cacheNode);
    } else {
      cacheNode = fnNode;
    }

    for (let i = 0, l = arguments.length; i < l; i++) {
      const arg = arguments[i];

      if (typeof arg === 'function' || typeof arg === 'object' && arg !== null) {
        // Objects go into a WeakMap
        let objectCache = cacheNode.o;

        if (objectCache === null) {
          cacheNode.o = objectCache = new WeakMap();
        }

        const objectNode = objectCache.get(arg);

        if (objectNode === undefined) {
          cacheNode = createCacheNode();
          objectCache.set(arg, cacheNode);
        } else {
          cacheNode = objectNode;
        }
      } else {
        // Primitives go into a regular Map
        let primitiveCache = cacheNode.p;

        if (primitiveCache === null) {
          cacheNode.p = primitiveCache = new Map();
        }

        const primitiveNode = primitiveCache.get(arg);

        if (primitiveNode === undefined) {
          cacheNode = createCacheNode();
          primitiveCache.set(arg, cacheNode);
        } else {
          cacheNode = primitiveNode;
        }
      }
    }

    if (cacheNode.s === TERMINATED) {
      return cacheNode.v;
    }

    if (cacheNode.s === ERRORED) {
      throw cacheNode.v;
    }

    try {
      // $FlowFixMe[incompatible-call]: We don't want to use rest arguments since we transpile the code.
      const result = fn.apply(null, arguments);
      const terminatedNode = cacheNode;
      terminatedNode.s = TERMINATED;
      terminatedNode.v = result;
      return result;
    } catch (error) {
      // We store the first error that's thrown and rethrow it.
      const erroredNode = cacheNode;
      erroredNode.s = ERRORED;
      erroredNode.v = error;
      throw error;
    }
  };
}

/**
 * Keeps track of the current batch's configuration such as how long an update
 * should suspend for if it needs to.
 */
const ReactCurrentBatchConfig = {
  transition: null
};

function startTransition(scope, options) {
  const prevTransition = ReactCurrentBatchConfig.transition; // Each renderer registers a callback to receive the return value of
  // the scope function. This is used to implement async actions.

  const callbacks = new Set();
  const transition = {
    _callbacks: callbacks
  };
  ReactCurrentBatchConfig.transition = transition;
  const currentTransition = ReactCurrentBatchConfig.transition;

  {
    try {
      const returnValue = scope();

      if (typeof returnValue === 'object' && returnValue !== null && typeof returnValue.then === 'function') {
        callbacks.forEach(callback => callback(currentTransition, returnValue));
        returnValue.then(noop, onError);
      }
    } catch (error) {
      onError(error);
    } finally {
      ReactCurrentBatchConfig.transition = prevTransition;
    }
  }
}

function noop() {} // Use reportError, if it exists. Otherwise console.error. This is the same as
// the default for onRecoverableError.


const onError = typeof reportError === 'function' ? // In modern browsers, reportError will dispatch an error event,
// emulating an uncaught JavaScript error.
reportError : error => {
  // In older browsers and test environments, fallback to console.error.
  // eslint-disable-next-line react-internal/no-production-logging
  console['error'](error);
};

function postpone(reason) {
  // eslint-disable-next-line react-internal/prod-error-codes
  const postponeInstance = new Error(reason);
  postponeInstance.$$typeof = REACT_POSTPONE_TYPE;
  throw postponeInstance;
}

var ReactVersion = '18.3.0-experimental-178c267a4e-20241218';

const getPrototypeOf = Object.getPrototypeOf;

// Turns a TypedArray or ArrayBuffer into a string that can be used for comparison
// in a Map to see if the bytes are the same.
function binaryToComparableString(view) {
  return String.fromCharCode.apply(String, new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
}

const TaintRegistryObjects = ReactServerSharedInternals.TaintRegistryObjects,
      TaintRegistryValues = ReactServerSharedInternals.TaintRegistryValues,
      TaintRegistryByteLengths = ReactServerSharedInternals.TaintRegistryByteLengths,
      TaintRegistryPendingRequests = ReactServerSharedInternals.TaintRegistryPendingRequests; // This is the shared constructor of all typed arrays.

const TypedArrayConstructor = getPrototypeOf(Uint32Array.prototype).constructor;
const defaultMessage = 'A tainted value was attempted to be serialized to a Client Component or Action closure. ' + 'This would leak it to the client.';

function cleanup(entryValue) {
  const entry = TaintRegistryValues.get(entryValue);

  if (entry !== undefined) {
    TaintRegistryPendingRequests.forEach(function (requestQueue) {
      requestQueue.push(entryValue);
      entry.count++;
    });

    if (entry.count === 1) {
      TaintRegistryValues.delete(entryValue);
    } else {
      entry.count--;
    }
  }
} // If FinalizationRegistry doesn't exist, we assume that objects life forever.
// E.g. the whole VM is just the lifetime of a request.


const finalizationRegistry = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(cleanup) : null;
function taintUniqueValue(message, lifetime, value) {


  message = '' + (message || defaultMessage);

  if (lifetime === null || typeof lifetime !== 'object' && typeof lifetime !== 'function') {
    throw Error(formatProdErrorMessage(493));
  }

  let entryValue;

  if (typeof value === 'string' || typeof value === 'bigint') {
    // Use as is.
    entryValue = value;
  } else if ((value instanceof TypedArrayConstructor || value instanceof DataView)) {
    // For now, we just convert binary data to a string so that we can just use the native
    // hashing in the Map implementation. It doesn't really matter what form the string
    // take as long as it's the same when we look it up.
    // We're not too worried about collisions since this should be a high entropy value.
    TaintRegistryByteLengths.add(value.byteLength);
    entryValue = binaryToComparableString(value);
  } else {
    const kind = value === null ? 'null' : typeof value;

    if (kind === 'object' || kind === 'function') {
      throw Error(formatProdErrorMessage(494));
    }

    throw Error(formatProdErrorMessage(495, kind));
  }

  const existingEntry = TaintRegistryValues.get(entryValue);

  if (existingEntry === undefined) {
    TaintRegistryValues.set(entryValue, {
      message,
      count: 1
    });
  } else {
    existingEntry.count++;
  }

  if (finalizationRegistry !== null) {
    finalizationRegistry.register(lifetime, entryValue);
  }
}
function taintObjectReference(message, object) {


  message = '' + (message || defaultMessage);

  if (typeof object === 'string' || typeof object === 'bigint') {
    throw Error(formatProdErrorMessage(496));
  }

  if (object === null || typeof object !== 'object' && typeof object !== 'function') {
    throw Error(formatProdErrorMessage(497));
  }

  TaintRegistryObjects.set(object, message);
}

// Patch fetch
const Children = {
  map: mapChildren,
  forEach: forEachChildren,
  count: countChildren,
  toArray,
  only: onlyChild
}; // These are server-only

exports.Children = Children;
exports.Fragment = REACT_FRAGMENT_TYPE;
exports.Profiler = REACT_PROFILER_TYPE;
exports.StrictMode = REACT_STRICT_MODE_TYPE;
exports.Suspense = REACT_SUSPENSE_TYPE;
exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
exports.__SECRET_SERVER_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactServerSharedInternals;
exports.cache = cache;
exports.cloneElement = cloneElement;
exports.createElement = createElement;
exports.createRef = createRef;
exports.experimental_taintObjectReference = taintObjectReference;
exports.experimental_taintUniqueValue = taintUniqueValue;
exports.forwardRef = forwardRef;
exports.isValidElement = isValidElement;
exports.lazy = lazy;
exports.memo = memo;
exports.startTransition = startTransition;
exports.unstable_DebugTracingMode = REACT_DEBUG_TRACING_MODE_TYPE;
exports.unstable_SuspenseList = REACT_SUSPENSE_TYPE;
exports.unstable_getCacheForType = getCacheForType;
exports.unstable_getCacheSignal = getCacheSignal;
exports.unstable_postpone = postpone;
exports.use = use;
exports.useCallback = useCallback;
exports.useDebugValue = useDebugValue;
exports.useId = useId;
exports.useMemo = useMemo;
exports.version = ReactVersion;