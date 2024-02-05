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

var React = require("next/dist/compiled/react");

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

var ReactVersion = '18.3.0-canary-60a927d04-20240113';

var Internals = {
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

var Dispatcher = Internals.Dispatcher;
function prefetchDNS(href) {
  {
    if (typeof href !== 'string' || !href) {
      error('ReactDOM.prefetchDNS(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.', getValueDescriptorExpectingObjectForWarning(href));
    } else if (arguments.length > 1) {
      var options = arguments[1];

      if (typeof options === 'object' && options.hasOwnProperty('crossOrigin')) {
        error('ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. It looks like the you are attempting to set a crossOrigin property for this DNS lookup hint. Browsers do not perform DNS queries using CORS and setting this attribute on the resource hint has no effect. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.', getValueDescriptorExpectingEnumForWarning(options));
      } else {
        error('ReactDOM.prefetchDNS(): Expected only one argument, `href`, but encountered %s as a second argument instead. This argument is reserved for future options and is currently disallowed. Try calling ReactDOM.prefetchDNS() with just a single string argument, `href`.', getValueDescriptorExpectingEnumForWarning(options));
      }
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    dispatcher.prefetchDNS(href);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preconnect(href, options) {
  {
    if (typeof href !== 'string' || !href) {
      error('ReactDOM.preconnect(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.', getValueDescriptorExpectingObjectForWarning(href));
    } else if (options != null && typeof options !== 'object') {
      error('ReactDOM.preconnect(): Expected the `options` argument (second) to be an object but encountered %s instead. The only supported option at this time is `crossOrigin` which accepts a string.', getValueDescriptorExpectingEnumForWarning(options));
    } else if (options != null && typeof options.crossOrigin !== 'string') {
      error('ReactDOM.preconnect(): Expected the `crossOrigin` option (second argument) to be a string but encountered %s instead. Try removing this option or passing a string value instead.', getValueDescriptorExpectingObjectForWarning(options.crossOrigin));
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    var crossOrigin = options ? getCrossOriginString(options.crossOrigin) : null;
    dispatcher.preconnect(href, crossOrigin);
  } // We don't error because preconnect needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preload(href, options) {
  {
    var encountered = '';

    if (typeof href !== 'string' || !href) {
      encountered += " The `href` argument encountered was " + getValueDescriptorExpectingObjectForWarning(href) + ".";
    }

    if (options == null || typeof options !== 'object') {
      encountered += " The `options` argument encountered was " + getValueDescriptorExpectingObjectForWarning(options) + ".";
    } else if (typeof options.as !== 'string' || !options.as) {
      encountered += " The `as` option encountered was " + getValueDescriptorExpectingObjectForWarning(options.as) + ".";
    }

    if (encountered) {
      error('ReactDOM.preload(): Expected two arguments, a non-empty `href` string and an `options` object with an `as` property valid for a `<link rel="preload" as="..." />` tag.%s', encountered);
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string' && // We check existence because we cannot enforce this function is actually called with the stated type
  typeof options === 'object' && options !== null && typeof options.as === 'string') {
    var as = options.as;
    var crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    dispatcher.preload(href, as, {
      crossOrigin: crossOrigin,
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
  {
    var encountered = '';

    if (typeof href !== 'string' || !href) {
      encountered += " The `href` argument encountered was " + getValueDescriptorExpectingObjectForWarning(href) + ".";
    }

    if (options !== undefined && typeof options !== 'object') {
      encountered += " The `options` argument encountered was " + getValueDescriptorExpectingObjectForWarning(options) + ".";
    } else if (options && 'as' in options && typeof options.as !== 'string') {
      encountered += " The `as` option encountered was " + getValueDescriptorExpectingObjectForWarning(options.as) + ".";
    }

    if (encountered) {
      error('ReactDOM.preloadModule(): Expected two arguments, a non-empty `href` string and, optionally, an `options` object with an `as` property valid for a `<link rel="modulepreload" as="..." />` tag.%s', encountered);
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    if (options) {
      var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
      dispatcher.preloadModule(href, {
        as: typeof options.as === 'string' && options.as !== 'script' ? options.as : undefined,
        crossOrigin: crossOrigin,
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
  {
    if (typeof href !== 'string' || !href) {
      error('ReactDOM.preinit(): Expected the `href` argument (first) to be a non-empty string but encountered %s instead.', getValueDescriptorExpectingObjectForWarning(href));
    } else if (options == null || typeof options !== 'object') {
      error('ReactDOM.preinit(): Expected the `options` argument (second) to be an object with an `as` property describing the type of resource to be preinitialized but encountered %s instead.', getValueDescriptorExpectingEnumForWarning(options));
    } else if (options.as !== 'style' && options.as !== 'script') {
      error('ReactDOM.preinit(): Expected the `as` property in the `options` argument (second) to contain a valid value describing the type of resource to be preinitialized but encountered %s instead. Valid values for `as` are "style" and "script".', getValueDescriptorExpectingEnumForWarning(options.as));
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string' && options && typeof options.as === 'string') {
    var as = options.as;
    var crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    var integrity = typeof options.integrity === 'string' ? options.integrity : undefined;
    var fetchPriority = typeof options.fetchPriority === 'string' ? options.fetchPriority : undefined;

    if (as === 'style') {
      dispatcher.preinitStyle(href, typeof options.precedence === 'string' ? options.precedence : undefined, {
        crossOrigin: crossOrigin,
        integrity: integrity,
        fetchPriority: fetchPriority
      });
    } else if (as === 'script') {
      dispatcher.preinitScript(href, {
        crossOrigin: crossOrigin,
        integrity: integrity,
        fetchPriority: fetchPriority,
        nonce: typeof options.nonce === 'string' ? options.nonce : undefined
      });
    }
  } // We don't error because preinit needs to be resilient to being called in a variety of scopes
  // and the runtime may not be capable of responding. The function is optimistic and not critical
  // so we favor silent bailout over warning or erroring.

}
function preinitModule(href, options) {
  {
    var encountered = '';

    if (typeof href !== 'string' || !href) {
      encountered += " The `href` argument encountered was " + getValueDescriptorExpectingObjectForWarning(href) + ".";
    }

    if (options !== undefined && typeof options !== 'object') {
      encountered += " The `options` argument encountered was " + getValueDescriptorExpectingObjectForWarning(options) + ".";
    } else if (options && 'as' in options && options.as !== 'script') {
      encountered += " The `as` option encountered was " + getValueDescriptorExpectingEnumForWarning(options.as) + ".";
    }

    if (encountered) {
      error('ReactDOM.preinitModule(): Expected up to two arguments, a non-empty `href` string and, optionally, an `options` object with a valid `as` property.%s', encountered);
    } else {
      var as = options && typeof options.as === 'string' ? options.as : 'script';

      switch (as) {
        case 'script':
          {
            break;
          }
        // We have an invalid as type and need to warn

        default:
          {
            var typeOfAs = getValueDescriptorExpectingEnumForWarning(as);

            error('ReactDOM.preinitModule(): Currently the only supported "as" type for this function is "script"' + ' but received "%s" instead. This warning was generated for `href` "%s". In the future other' + ' module types will be supported, aligning with the import-attributes proposal. Learn more here:' + ' (https://github.com/tc39/proposal-import-attributes)', typeOfAs, href);
          }
      }
    }
  }

  var dispatcher = Dispatcher.current;

  if (dispatcher && typeof href === 'string') {
    if (typeof options === 'object' && options !== null) {
      if (options.as == null || options.as === 'script') {
        var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
        dispatcher.preinitModuleScript(href, {
          crossOrigin: crossOrigin,
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

function getValueDescriptorExpectingObjectForWarning(thing) {
  return thing === null ? '`null`' : thing === undefined ? '`undefined`' : thing === '' ? 'an empty string' : "something with type \"" + typeof thing + "\"";
}

function getValueDescriptorExpectingEnumForWarning(thing) {
  return thing === null ? '`null`' : thing === undefined ? '`undefined`' : thing === '' ? 'an empty string' : typeof thing === 'string' ? JSON.stringify(thing) : typeof thing === 'number' ? '`' + thing + '`' : "something with type \"" + typeof thing + "\"";
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
function useFormState(action, initialState, permalink) {
  {
    var dispatcher = resolveDispatcher(); // $FlowFixMe[not-a-function] This is unstable, thus optional

    return dispatcher.useFormState(action, initialState, permalink);
  }
}

function createPortal() {
  throw new Error('createPortal was called on the server. Portals are not currently' + ' supported on the server. Update your program to conditionally call' + ' createPortal on the client only.');
}
function flushSync() {
  throw new Error('flushSync was called on the server. This is likely caused by a' + ' function being called during render or in module scope that was' + ' intended to be called from an effect or event handler. Update your' + ' to not call flushSync no the server.');
} // on the server we just call the callback because there is
// not update mechanism. Really this should not be called on the
// server but since the semantics are generally clear enough we
// can provide this trivial implementation.

function batchedUpdates(fn, a) {
  return fn(a);
}

function experimental_useFormStatus() {
  {
    error('useFormStatus is now in canary. Remove the experimental_ prefix. ' + 'The prefixed alias will be removed in an upcoming release.');
  }

  return useFormStatus();
}
function experimental_useFormState(action, initialState, permalink) {
  {
    error('useFormState is now in canary. Remove the experimental_ prefix. ' + 'The prefixed alias will be removed in an upcoming release.');
  }

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
  })();
}
