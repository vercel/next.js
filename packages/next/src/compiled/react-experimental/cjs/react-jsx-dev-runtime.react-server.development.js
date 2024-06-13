/**
 * @license React
 * react-jsx-dev-runtime.react-server.development.js
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

// -----------------------------------------------------------------------------

var enableScopeAPI = false; // Experimental Create Event Handle API.
var enableTransitionTracing = false; // No known bugs, but needs performance testing

var enableLegacyHidden = false; // Enables unstable_avoidThisFallback feature in Fiber
// as a normal prop instead of stripping it from the props object.
// Passes `ref` as a normal prop instead of stripping it from the props object
// during element creation.

var enableRefAsProp = true;

var enableRenderableContext = true; // Enables the `initialValue` option for `useDeferredValue`
// stuff. Intended to enable React core members to more easily debug scheduling
// issues in DEV builds.

var enableDebugTracing = false;

var REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element') ;
var REACT_PORTAL_TYPE = Symbol.for('react.portal');
var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');
var REACT_STRICT_MODE_TYPE = Symbol.for('react.strict_mode');
var REACT_PROFILER_TYPE = Symbol.for('react.profiler');
var REACT_PROVIDER_TYPE = Symbol.for('react.provider'); // TODO: Delete with enableRenderableContext

var REACT_CONSUMER_TYPE = Symbol.for('react.consumer');
var REACT_CONTEXT_TYPE = Symbol.for('react.context');
var REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
var REACT_SUSPENSE_TYPE = Symbol.for('react.suspense');
var REACT_SUSPENSE_LIST_TYPE = Symbol.for('react.suspense_list');
var REACT_MEMO_TYPE = Symbol.for('react.memo');
var REACT_LAZY_TYPE = Symbol.for('react.lazy');
var REACT_OFFSCREEN_TYPE = Symbol.for('react.offscreen');
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

var ReactSharedInternalsServer = // $FlowFixMe: It's defined in the one we resolve to.
React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

if (!ReactSharedInternalsServer) {
  throw new Error('The "react" package in this environment is not configured correctly. ' + 'The "react-server" condition must be enabled in any environment that ' + 'runs React Server Components.');
}

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

    if (!supportsCreateTask && ReactSharedInternalsServer.getCurrentStack) {
      // We only add the current stack to the console when createTask is not supported.
      // Since createTask requires DevTools to be open to work, this means that stacks
      // can be lost while DevTools isn't open but we can't detect this.
      var stack = ReactSharedInternalsServer.getCurrentStack(currentStack);

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

function getWrappedName(outerType, innerType, wrapperName) {
  var displayName = outerType.displayName;

  if (displayName) {
    return displayName;
  }

  var functionName = innerType.displayName || innerType.name || '';
  return functionName !== '' ? wrapperName + "(" + functionName + ")" : wrapperName;
} // Keep in sync with react-reconciler/getComponentNameFromFiber


function getContextName(type) {
  return type.displayName || 'Context';
}

var REACT_CLIENT_REFERENCE$2 = Symbol.for('react.client.reference'); // Note that the reconciler package should generally prefer to use getComponentNameFromFiber() instead.

function getComponentNameFromType(type) {
  if (type == null) {
    // Host root, text node or just invalid type.
    return null;
  }

  if (typeof type === 'function') {
    if (type.$$typeof === REACT_CLIENT_REFERENCE$2) {
      // TODO: Create a convention for naming client references with debug info.
      return null;
    }

    return type.displayName || type.name || null;
  }

  if (typeof type === 'string') {
    return type;
  }

  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return 'Fragment';

    case REACT_PORTAL_TYPE:
      return 'Portal';

    case REACT_PROFILER_TYPE:
      return 'Profiler';

    case REACT_STRICT_MODE_TYPE:
      return 'StrictMode';

    case REACT_SUSPENSE_TYPE:
      return 'Suspense';

    case REACT_SUSPENSE_LIST_TYPE:
      return 'SuspenseList';

  }

  if (typeof type === 'object') {
    {
      if (typeof type.tag === 'number') {
        error('Received an unexpected object in getComponentNameFromType(). ' + 'This is likely a bug in React. Please file an issue.');
      }
    }

    switch (type.$$typeof) {
      case REACT_PROVIDER_TYPE:
        {
          return null;
        }

      case REACT_CONTEXT_TYPE:
        var context = type;

        {
          return getContextName(context) + '.Provider';
        }

      case REACT_CONSUMER_TYPE:
        {
          var consumer = type;
          return getContextName(consumer._context) + '.Consumer';
        }

      case REACT_FORWARD_REF_TYPE:
        return getWrappedName(type, type.render, 'ForwardRef');

      case REACT_MEMO_TYPE:
        var outerName = type.displayName || null;

        if (outerName !== null) {
          return outerName;
        }

        return getComponentNameFromType(type.type) || 'Memo';

      case REACT_LAZY_TYPE:
        {
          var lazyComponent = type;
          var payload = lazyComponent._payload;
          var init = lazyComponent._init;

          try {
            return getComponentNameFromType(init(payload));
          } catch (x) {
            return null;
          }
        }
    }
  }

  return null;
}

// $FlowFixMe[method-unbinding]
var hasOwnProperty = Object.prototype.hasOwnProperty;

/*
 * The `'' + value` pattern (used in perf-sensitive code) throws for Symbol
 * and Temporal.* types. See https://github.com/facebook/react/pull/22064.
 *
 * The functions in this module will throw an easier-to-understand,
 * easier-to-debug exception with a clear errors message message explaining the
 * problem. (Instead of a confusing exception thrown inside the implementation
 * of the `value` object).
 */
// $FlowFixMe[incompatible-return] only called in DEV, so void return is not possible.
function typeName(value) {
  {
    // toStringTag is needed for namespaced types like Temporal.Instant
    var hasToStringTag = typeof Symbol === 'function' && Symbol.toStringTag;
    var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || 'Object'; // $FlowFixMe[incompatible-return]

    return type;
  }
} // $FlowFixMe[incompatible-return] only called in DEV, so void return is not possible.


function willCoercionThrow(value) {
  {
    try {
      testStringCoercion(value);
      return false;
    } catch (e) {
      return true;
    }
  }
}

function testStringCoercion(value) {
  // If you ended up here by following an exception call stack, here's what's
  // happened: you supplied an object or symbol value to React (as a prop, key,
  // DOM attribute, CSS property, string ref, etc.) and when React tried to
  // coerce it to a string using `'' + value`, an exception was thrown.
  //
  // The most common types that will cause this exception are `Symbol` instances
  // and Temporal objects like `Temporal.Instant`. But any object that has a
  // `valueOf` or `[Symbol.toPrimitive]` method that throws will also cause this
  // exception. (Library authors do this to prevent users from using built-in
  // numeric operators like `+` or comparison operators like `>=` because custom
  // methods are needed to perform accurate arithmetic or comparison.)
  //
  // To fix the problem, coerce this object or symbol value to a string before
  // passing it to React. The most reliable way is usually `String(value)`.
  //
  // To find which value is throwing, check the browser or debugger console.
  // Before this exception was thrown, there should be `console.error` output
  // that shows the type (Symbol, Temporal.PlainDate, etc.) that caused the
  // problem and how that type was used: key, atrribute, input value prop, etc.
  // In most cases, this console output also shows the component and its
  // ancestor components where the exception happened.
  //
  // eslint-disable-next-line react-internal/safe-string-coercion
  return '' + value;
}
function checkKeyStringCoercion(value) {
  {
    if (willCoercionThrow(value)) {
      error('The provided key is an unsupported type %s.' + ' This value must be coerced to a string before using it here.', typeName(value));

      return testStringCoercion(value); // throw (to help callers find troubleshooting comments)
    }
  }
}

var REACT_CLIENT_REFERENCE$1 = Symbol.for('react.client.reference'); // This function is deprecated. Don't use. Only the renderer knows what a valid type is.
// TODO: Delete this when enableOwnerStacks ships.

function isValidElementType(type) {
  if (typeof type === 'string' || typeof type === 'function') {
    return true;
  } // Note: typeof might be other than 'symbol' or 'number' (e.g. if it's a polyfill).


  if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing  || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden  || type === REACT_OFFSCREEN_TYPE || enableScopeAPI  || enableTransitionTracing ) {
    return true;
  }

  if (typeof type === 'object' && type !== null) {
    if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || !enableRenderableContext  || type.$$typeof === REACT_CONSUMER_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
    // types supported by any Flight configuration anywhere since
    // we don't know which Flight build this will end up being used
    // with.
    type.$$typeof === REACT_CLIENT_REFERENCE$1 || type.getModuleId !== undefined) {
      return true;
    }
  }

  return false;
}

var isArrayImpl = Array.isArray; // eslint-disable-next-line no-redeclare

function isArray(a) {
  return isArrayImpl(a);
}

{
  var PossiblyWeakMap = typeof WeakMap === 'function' ? WeakMap : Map;
  new PossiblyWeakMap();
}

var REACT_CLIENT_REFERENCE = Symbol.for('react.client.reference');
var createTask = // eslint-disable-next-line react-internal/no-production-logging
console.createTask ? // eslint-disable-next-line react-internal/no-production-logging
console.createTask : function () {
  return null;
};

function getTaskName(type) {
  if (type === REACT_FRAGMENT_TYPE) {
    return '<>';
  }

  if (typeof type === 'object' && type !== null && type.$$typeof === REACT_LAZY_TYPE) {
    // We don't want to eagerly initialize the initializer in DEV mode so we can't
    // call it to extract the type so we don't know the type of this component.
    return '<...>';
  }

  try {
    var name = getComponentNameFromType(type);
    return name ? '<' + name + '>' : '<...>';
  } catch (x) {
    return '<...>';
  }
}

function getOwner() {
  {
    var dispatcher = ReactSharedInternalsServer.A;

    if (dispatcher === null) {
      return null;
    }

    return dispatcher.getOwner();
  }
}

var specialPropKeyWarningShown;
var didWarnAboutElementRef;

{
  didWarnAboutElementRef = {};
}

function hasValidRef(config) {
  {
    if (hasOwnProperty.call(config, 'ref')) {
      var getter = Object.getOwnPropertyDescriptor(config, 'ref').get;

      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }

  return config.ref !== undefined;
}

function hasValidKey(config) {
  {
    if (hasOwnProperty.call(config, 'key')) {
      var getter = Object.getOwnPropertyDescriptor(config, 'key').get;

      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }

  return config.key !== undefined;
}

function defineKeyPropWarningGetter(props, displayName) {
  {
    var warnAboutAccessingKey = function () {
      if (!specialPropKeyWarningShown) {
        specialPropKeyWarningShown = true;

        error('%s: `key` is not a prop. Trying to access it will result ' + 'in `undefined` being returned. If you need to access the same ' + 'value within the child component, you should pass it as a different ' + 'prop. (https://react.dev/link/special-props)', displayName);
      }
    };

    warnAboutAccessingKey.isReactWarning = true;
    Object.defineProperty(props, 'key', {
      get: warnAboutAccessingKey,
      configurable: true
    });
  }
}

function elementRefGetterWithDeprecationWarning() {
  {
    var componentName = getComponentNameFromType(this.type);

    if (!didWarnAboutElementRef[componentName]) {
      didWarnAboutElementRef[componentName] = true;

      error('Accessing element.ref was removed in React 19. ref is now a ' + 'regular prop. It will be removed from the JSX Element ' + 'type in a future release.');
    } // An undefined `element.ref` is coerced to `null` for
    // backwards compatibility.


    var refProp = this.props.ref;
    return refProp !== undefined ? refProp : null;
  }
}
/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.transitional.element') to check
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


function ReactElement(type, key, _ref, self, source, owner, props, debugStack, debugTask) {
  var ref;

  {
    // When enableRefAsProp is on, ignore whatever was passed as the ref
    // argument and treat `props.ref` as the source of truth. The only thing we
    // use this for is `element.ref`, which will log a deprecation warning on
    // access. In the next release, we can remove `element.ref` as well as the
    // `ref` argument.
    var refProp = props.ref; // An undefined `element.ref` is coerced to `null` for
    // backwards compatibility.

    ref = refProp !== undefined ? refProp : null;
  }

  var element;

  {
    // In dev, make `ref` a non-enumerable property with a warning. It's non-
    // enumerable so that test matchers and serializers don't access it and
    // trigger the warning.
    //
    // `ref` will be removed from the element completely in a future release.
    element = {
      // This tag allows us to uniquely identify this as a React Element
      $$typeof: REACT_ELEMENT_TYPE,
      // Built-in properties that belong on the element
      type: type,
      key: key,
      props: props,
      // Record the component responsible for creating this element.
      _owner: owner
    };

    if (ref !== null) {
      Object.defineProperty(element, 'ref', {
        enumerable: false,
        get: elementRefGetterWithDeprecationWarning
      });
    } else {
      // Don't warn on access if a ref is not given. This reduces false
      // positives in cases where a test serializer uses
      // getOwnPropertyDescriptors to compare objects, like Jest does, which is
      // a problem because it bypasses non-enumerability.
      //
      // So unfortunately this will trigger a false positive warning in Jest
      // when the diff is printed:
      //
      //   expect(<div ref={ref} />).toEqual(<span ref={ref} />);
      //
      // A bit sketchy, but this is what we've done for the `props.key` and
      // `props.ref` accessors for years, which implies it will be good enough
      // for `element.ref`, too. Let's see if anyone complains.
      Object.defineProperty(element, 'ref', {
        enumerable: false,
        value: null
      });
    }
  }

  {
    // The validation flag is currently mutative. We put it on
    // an external backing store so that we can freeze the whole object.
    // This can be replaced with a WeakMap once they are implemented in
    // commonly used development environments.
    element._store = {}; // To make comparing ReactElements easier for testing purposes, we make
    // the validation flag non-enumerable (where possible, which should
    // include every environment we run tests in), so the test framework
    // ignores it.

    Object.defineProperty(element._store, 'validated', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: 0
    }); // debugInfo contains Server Component debug information.

    Object.defineProperty(element, '_debugInfo', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: null
    });

    {
      Object.defineProperty(element, '_debugStack', {
        configurable: false,
        enumerable: false,
        writable: true,
        value: debugStack
      });
      Object.defineProperty(element, '_debugTask', {
        configurable: false,
        enumerable: false,
        writable: true,
        value: debugTask
      });
    }

    if (Object.freeze) {
      Object.freeze(element.props);
      Object.freeze(element);
    }
  }

  return element;
}
// support `jsx` and `jsxs` when running in development. This supports the case
// where a third-party dependency ships code that was compiled for production;
// we want to still provide warnings in development.
//
// So these functions are the _dev_ implementations of the _production_
// API signatures.
//
// Since these functions are dev-only, it's ok to add an indirection here. They
// only exist to provide different versions of `isStaticChildren`. (We shouldn't
// use this pattern for the prod versions, though, because it will add an call
// frame.)

function jsxProdSignatureRunningInDevWithDynamicChildren(type, config, maybeKey, source, self) {
  {
    var isStaticChildren = false;
    return jsxDEVImpl(type, config, maybeKey, isStaticChildren, source, self, Error('react-stack-top-frame') , createTask(getTaskName(type)) );
  }
}
function jsxProdSignatureRunningInDevWithStaticChildren(type, config, maybeKey, source, self) {
  {
    var isStaticChildren = true;
    return jsxDEVImpl(type, config, maybeKey, isStaticChildren, source, self, Error('react-stack-top-frame') , createTask(getTaskName(type)) );
  }
}
var didWarnAboutKeySpread = {};
/**
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */

function jsxDEV$1(type, config, maybeKey, isStaticChildren, source, self) {
  return jsxDEVImpl(type, config, maybeKey, isStaticChildren, source, self, Error('react-stack-top-frame') , createTask(getTaskName(type)) );
}

function jsxDEVImpl(type, config, maybeKey, isStaticChildren, source, self, debugStack, debugTask) {
  {
    if (!isValidElementType(type)) {
      // This is an invalid element type.
      //
      // We warn in this case but don't throw. We expect the element creation to
      // succeed and there will likely be errors in render.
      var info = '';

      if (type === undefined || typeof type === 'object' && type !== null && Object.keys(type).length === 0) {
        info += ' You likely forgot to export your component from the file ' + "it's defined in, or you might have mixed up default and named imports.";
      }

      var typeString;

      if (type === null) {
        typeString = 'null';
      } else if (isArray(type)) {
        typeString = 'array';
      } else if (type !== undefined && type.$$typeof === REACT_ELEMENT_TYPE) {
        typeString = "<" + (getComponentNameFromType(type.type) || 'Unknown') + " />";
        info = ' Did you accidentally export a JSX literal instead of a component?';
      } else {
        typeString = typeof type;
      }

      error('React.jsx: type is invalid -- expected a string (for ' + 'built-in components) or a class/function (for composite ' + 'components) but got: %s.%s', typeString, info);
    } else {
      // This is a valid element type.
      // Skip key warning if the type isn't valid since our key validation logic
      // doesn't expect a non-string/function type and can throw confusing
      // errors. We don't want exception behavior to differ between dev and
      // prod. (Rendering will throw with a helpful message and as soon as the
      // type is fixed, the key warnings will appear.)
      var children = config.children;

      if (children !== undefined) {
        if (isStaticChildren) {
          if (isArray(children)) {
            for (var i = 0; i < children.length; i++) {
              validateChildKeys(children[i]);
            }

            if (Object.freeze) {
              Object.freeze(children);
            }
          } else {
            error('React.jsx: Static children should always be an array. ' + 'You are likely explicitly calling React.jsxs or React.jsxDEV. ' + 'Use the Babel transform instead.');
          }
        } else {
          validateChildKeys(children);
        }
      }
    } // Warn about key spread regardless of whether the type is valid.


    if (hasOwnProperty.call(config, 'key')) {
      var componentName = getComponentNameFromType(type);
      var keys = Object.keys(config).filter(function (k) {
        return k !== 'key';
      });
      var beforeExample = keys.length > 0 ? '{key: someKey, ' + keys.join(': ..., ') + ': ...}' : '{key: someKey}';

      if (!didWarnAboutKeySpread[componentName + beforeExample]) {
        var afterExample = keys.length > 0 ? '{' + keys.join(': ..., ') + ': ...}' : '{}';

        error('A props object containing a "key" prop is being spread into JSX:\n' + '  let props = %s;\n' + '  <%s {...props} />\n' + 'React keys must be passed directly to JSX without using spread:\n' + '  let props = %s;\n' + '  <%s key={someKey} {...props} />', beforeExample, componentName, afterExample, componentName);

        didWarnAboutKeySpread[componentName + beforeExample] = true;
      }
    }

    var key = null;
    var ref = null; // Currently, key can be spread in as a prop. This causes a potential
    // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
    // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
    // but as an intermediary step, we will use jsxDEV for everything except
    // <div {...props} key="Hi" />, because we aren't currently able to tell if
    // key is explicitly declared to be undefined or not.

    if (maybeKey !== undefined) {
      {
        checkKeyStringCoercion(maybeKey);
      }

      key = '' + maybeKey;
    }

    if (hasValidKey(config)) {
      {
        checkKeyStringCoercion(config.key);
      }

      key = '' + config.key;
    }

    if (hasValidRef(config)) ;

    var props;

    if (!('key' in config)) {
      // If key was not spread in, we can reuse the original props object. This
      // only works for `jsx`, not `createElement`, because `jsx` is a compiler
      // target and the compiler always passes a new object. For `createElement`,
      // we can't assume a new object is passed every time because it can be
      // called manually.
      //
      // Spreading key is a warning in dev. In a future release, we will not
      // remove a spread key from the props object. (But we'll still warn.) We'll
      // always pass the object straight through.
      props = config;
    } else {
      // We need to remove reserved props (key, prop, ref). Create a fresh props
      // object and copy over all the non-reserved props. We don't use `delete`
      // because in V8 it will deopt the object to dictionary mode.
      props = {};

      for (var propName in config) {
        // Skip over reserved prop names
        if (propName !== 'key' && (enableRefAsProp )) {
          {
            props[propName] = config[propName];
          }
        }
      }
    }

    if (key || !enableRefAsProp ) {
      var displayName = typeof type === 'function' ? type.displayName || type.name || 'Unknown' : type;

      if (key) {
        defineKeyPropWarningGetter(props, displayName);
      }
    }

    return ReactElement(type, key, ref, self, source, getOwner(), props, debugStack, debugTask);
  }
}
/**
 * Ensure that every element either is passed in a static location, in an
 * array with an explicit keys property defined, or in an object literal
 * with valid key property.
 *
 * @internal
 * @param {ReactNode} node Statically passed child of any type.
 * @param {*} parentType node's parent's type.
 */

function validateChildKeys(node, parentType) {
  {
    if (typeof node !== 'object' || !node) {
      return;
    }

    if (node.$$typeof === REACT_CLIENT_REFERENCE) ; else if (isArray(node)) ; else if (isValidElement(node)) {
      // This element was passed in a valid location.
      if (node._store) {
        node._store.validated = 1;
      }
    } else {
      var iteratorFn = getIteratorFn(node);

      if (typeof iteratorFn === 'function') {
        // Entry iterators used to provide implicit keys,
        // but now we print a separate warning for them later.
        if (iteratorFn !== node.entries) {
          var iterator = iteratorFn.call(node);

          if (iterator !== node) {

            while (!(iterator.next()).done) {
            }
          }
        }
      }
    }
  }
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

var jsx = jsxProdSignatureRunningInDevWithDynamicChildren ; // we may want to special case jsxs internally to take advantage of static children.
// for now we can ship identical prod functions

var jsxs = jsxProdSignatureRunningInDevWithStaticChildren ;
var jsxDEV = jsxDEV$1 ;

exports.Fragment = REACT_FRAGMENT_TYPE;
exports.jsx = jsx;
exports.jsxDEV = jsxDEV;
exports.jsxs = jsxs;
  })();
}
