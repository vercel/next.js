/**
 * @license React
 * react-dom.shared-subset.production.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const Internals = {
  usingClientEntryPoint: false,
  Events: null,
  Dispatcher: {
    current: null
  }
};

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

exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Internals;
exports.preconnect = preconnect;
exports.prefetchDNS = prefetchDNS;
exports.preinit = preinit;
exports.preinitModule = preinitModule;
exports.preload = preload;
exports.preloadModule = preloadModule;