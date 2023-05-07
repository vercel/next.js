/**
 * @license React
 * react-dom-server-rendering-stub.development.js
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

var ReactVersion = '18.3.0-experimental-aef7ce554-20230503';

var Internals = {
  usingClientEntryPoint: false,
  Events: null,
  Dispatcher: {
    current: null
  }
};

var Dispatcher = Internals.Dispatcher;
function prefetchDNS(href) {
  var passedOptionArg;

  {
    if (arguments[1] !== undefined) {
      passedOptionArg = arguments[1];
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher) {
    {
      if (passedOptionArg !== undefined) {
        // prefetchDNS will warn if you pass reserved options arg. We pass it along in Dev only to
        // elicit the warning. In prod we do not forward since it is not a part of the interface.
        // @TODO move all arg validation into this file. It needs to be universal anyway so may as well lock down the interace here and
        // let the rest of the codebase trust the types
        dispatcher.prefetchDNS(href, passedOptionArg);
      } else {
        dispatcher.prefetchDNS(href);
      }
    }
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preconnect(href, options) {
  var dispatcher = Dispatcher.current;

  if (dispatcher) {
    dispatcher.preconnect(href, options);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preload(href, options) {
  var dispatcher = Dispatcher.current;

  if (dispatcher) {
    dispatcher.preload(href, options);
  } // We don't error because preload needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preinit(href, options) {
  var dispatcher = Dispatcher.current;

  if (dispatcher) {
    dispatcher.preinit(href, options);
  } // We don't error because preinit needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}

function createPortal() {
  throw new Error('createPortal was called on the server. Portals are not currently' + ' supported on the server. Update your program to conditionally call' + ' createPortal on the client only.');
}
function flushSync() {
  throw new Error('flushSync was called on the server. This is likely caused by a' + ' function being called during render or in module scope that was' + ' intended to be called from an effect or event handler. Update your' + ' to not call flushSync no the server.');
}

exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Internals;
exports.createPortal = createPortal;
exports.flushSync = flushSync;
exports.preconnect = preconnect;
exports.prefetchDNS = prefetchDNS;
exports.preinit = preinit;
exports.preload = preload;
exports.version = ReactVersion;
  })();
}
