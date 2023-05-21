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

var React = require("next/dist/compiled/react-experimental");

var ReactVersion = '18.3.0-experimental-16d053d59-20230506';

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

var ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher; // Since the "not pending" value is always the same, we can reuse the

function resolveDispatcher() {
  // Copied from react/src/ReactHooks.js. It's the same thing but in a
  // different package.
  var dispatcher = ReactCurrentDispatcher.current;

  {
    if (dispatcher === null) {
      error('Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for' + ' one of the following reasons:\n' + '1. You might have mismatching versions of React and the renderer (such as React DOM)\n' + '2. You might be breaking the Rules of Hooks\n' + '3. You might have more than one copy of React in the same app\n' + 'See https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.');
    }
  } // Will result in a null access error if accessed outside render phase. We
  // intentionally don't throw our own error because this is in a hot path.
  // Also helps ensure this is inlined.


  return dispatcher;
}

function useFormStatus() {
  {
    var dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] We know this exists because of the feature check above.

    return dispatcher.useHostTransitionStatus();
  }
}

function createPortal() {
  throw new Error('createPortal was called on the server. Portals are not currently' + ' supported on the server. Update your program to conditionally call' + ' createPortal on the client only.');
}
function flushSync() {
  throw new Error('flushSync was called on the server. This is likely caused by a' + ' function being called during render or in module scope that was' + ' intended to be called from an effect or event handler. Update your' + ' to not call flushSync no the server.');
}

exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Internals;
exports.createPortal = createPortal;
exports.experimental_useFormStatus = useFormStatus;
exports.flushSync = flushSync;
exports.preconnect = preconnect;
exports.prefetchDNS = prefetchDNS;
exports.preinit = preinit;
exports.preload = preload;
exports.version = ReactVersion;
  })();
}
