/**
 * @license React
 * react-compiler-runtime.development.js
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

var supportsCreateTask = !!console.createTask;

function printWarning(level, format, args, currentStack) {
  // When changing this logic, you might want to also
  // update consoleWithStackDev.www.js as well.
  {
    var isErrorLogger = format === '%s\n\n%s\n' || format === '%o\n\n%s\n\n%s\n';

    if (!supportsCreateTask && ReactSharedInternals.getCurrentStack) {
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

function resolveDispatcher() {
  var dispatcher = ReactSharedInternals.H;

  {
    if (dispatcher === null) {
      error('Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for' + ' one of the following reasons:\n' + '1. You might have mismatching versions of React and the renderer (such as React DOM)\n' + '2. You might be breaking the Rules of Hooks\n' + '3. You might have more than one copy of React in the same app\n' + 'See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.');
    }
  } // Will result in a null access error if accessed outside render phase. We
  // intentionally don't throw our own error because this is in a hot path.
  // Also helps ensure this is inlined.


  return dispatcher;
}
function useMemoCache(size) {
  var dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] This is unstable, thus optional

  return dispatcher.useMemoCache(size);
}

exports.c = useMemoCache;
  })();
}
