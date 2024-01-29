/**
 * @license React
 * react-dom-server-rendering-stub.production.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var React = require("next/dist/compiled/react");

var ReactVersion = '18.3.0-canary-60a927d04-20240113';

const Internals = {
  usingClientEntryPoint: false,
  Events: null,
  Dispatcher: {
    current: null
  }
};

// Do not require this module directly! Use normal `invariant` calls with
// template literal strings. The messages will be replaced with error codes
// during build.
function formatProdErrorMessage(code) {
  let url = 'https://reactjs.org/docs/error-decoder.html?invariant=' + code;

  for (let i = 1; i < arguments.length; i++) {
    url += '&args[]=' + encodeURIComponent(arguments[i]);
  }

  return "Minified React error #" + code + "; visit " + url + " for the full message or " + 'use the non-minified dev environment for full errors and additional ' + 'helpful warnings.';
}

function getCrossOriginString(input) {
  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}
function getCrossOriginStringAs(as, input) {
  if (as === 'font') {
    return '';
  }

  if (typeof input === 'string') {
    return input === 'use-credentials' ? input : '';
  }

  return undefined;
}

const Dispatcher = Internals.Dispatcher;
function prefetchDNS(href) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    dispatcher.prefetchDNS(href);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preconnect(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    const crossOrigin = options ? getCrossOriginString(options.crossOrigin) : null;
    dispatcher.preconnect(href, crossOrigin);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preload(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string' && // We check existence because we cannot enforce this function is actually called with the stated type
  typeof options === 'object' && options !== null && typeof options.as === 'string') {
    const as = options.as;
    const crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    dispatcher.preload(href, as, {
      crossOrigin,
      integrity: typeof options.integrity === 'string' ? options.integrity : undefined,
      nonce: typeof options.nonce === 'string' ? options.nonce : undefined,
      type: typeof options.type === 'string' ? options.type : undefined,
      fetchPriority: typeof options.fetchPriority === 'string' ? options.fetchPriority : undefined,
      referrerPolicy: typeof options.referrerPolicy === 'string' ? options.referrerPolicy : undefined,
      imageSrcSet: typeof options.imageSrcSet === 'string' ? options.imageSrcSet : undefined,
      imageSizes: typeof options.imageSizes === 'string' ? options.imageSizes : undefined
    });
  } // We don't error because preload needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preloadModule(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    if (options) {
      const crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
      dispatcher.preloadModule(href, {
        as: typeof options.as === 'string' && options.as !== 'script' ? options.as : undefined,
        crossOrigin,
        integrity: typeof options.integrity === 'string' ? options.integrity : undefined
      });
    } else {
      dispatcher.preloadModule(href);
    }
  } // We don't error because preload needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preinit(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string' && options && typeof options.as === 'string') {
    const as = options.as;
    const crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    const integrity = typeof options.integrity === 'string' ? options.integrity : undefined;
    const fetchPriority = typeof options.fetchPriority === 'string' ? options.fetchPriority : undefined;

    if (as === 'style') {
      dispatcher.preinitStyle(href, typeof options.precedence === 'string' ? options.precedence : undefined, {
        crossOrigin,
        integrity,
        fetchPriority
      });
    } else if (as === 'script') {
      dispatcher.preinitScript(href, {
        crossOrigin,
        integrity,
        fetchPriority,
        nonce: typeof options.nonce === 'string' ? options.nonce : undefined
      });
    }
  } // We don't error because preinit needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preinitModule(href, options) {

  const dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    if (typeof options === 'object' && options !== null) {
      if (options.as == null || options.as === 'script') {
        const crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
        dispatcher.preinitModuleScript(href, {
          crossOrigin,
          integrity: typeof options.integrity === 'string' ? options.integrity : undefined,
          nonce: typeof options.nonce === 'string' ? options.nonce : undefined
        });
      }
    } else if (options == null) {
      dispatcher.preinitModuleScript(href);
    }
  } // We don't error because preinit needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}

const ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher; // Since the "not pending" value is always the same, we can reuse the

function resolveDispatcher() {
  // Copied from react/src/ReactHooks.js. It's the same thing but in a
  // different package.
  const dispatcher = ReactCurrentDispatcher.current;
  // intentionally don't throw our own error because this is in a hot path.
  // Also helps ensure this is inlined.


  return dispatcher;
}

function useFormStatus() {
  {
    const dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] We know this exists because of the feature check above.

    return dispatcher.useHostTransitionStatus();
  }
}
function useFormState(action, initialState, permalink) {
  {
    const dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] This is unstable, thus optional

    return dispatcher.useFormState(action, initialState, permalink);
  }
}

function createPortal() {
  throw Error(formatProdErrorMessage(448));
}
function flushSync() {
  throw Error(formatProdErrorMessage(449));
} // on the server we just call the callback because there is
// not update mechanism. Really this should not be called on the
// server but since the semantics are generally clear enough we
// can provide this trivial implementation.

function batchedUpdates(fn, a) {
  return fn(a);
}

// Export all exports so that they're available in tests.
function experimental_useFormStatus() {

  return useFormStatus();
}
function experimental_useFormState(action, initialState, permalink) {

  return useFormState(action, initialState, permalink);
}

exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Internals;
exports.createPortal = createPortal;
exports.experimental_useFormState = experimental_useFormState;
exports.experimental_useFormStatus = experimental_useFormStatus;
exports.flushSync = flushSync;
exports.preconnect = preconnect;
exports.prefetchDNS = prefetchDNS;
exports.preinit = preinit;
exports.preinitModule = preinitModule;
exports.preload = preload;
exports.preloadModule = preloadModule;
exports.unstable_batchedUpdates = batchedUpdates;
exports.useFormState = useFormState;
exports.useFormStatus = useFormStatus;
exports.version = ReactVersion;