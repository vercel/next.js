/**
 * @license React
 * react-jsx-runtime.profiling.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var React = require('react');

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'
// The Symbol used to tag the ReactElement-like types.
const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');

const ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

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
    ref = _ref;
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
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */


function jsxProd(type, config, maybeKey) {
  let propName; // Reserved names are extracted

  const props = {};
  let key = null;
  let ref = null; // Currently, key can be spread in as a prop. This causes a potential
  // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
  // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
  // but as an intermediary step, we will use jsxDEV for everything except
  // <div {...props} key="Hi" />, because we aren't currently able to tell if
  // key is explicitly declared to be undefined or not.

  if (maybeKey !== undefined) {

    key = '' + maybeKey;
  }

  if (hasValidKey(config)) {

    key = '' + config.key;
  }

  if (hasValidRef(config)) {
    {
      ref = config.ref;
    }
  } // Remaining properties are added to a new props object


  for (propName in config) {
    if (hasOwnProperty.call(config, propName) && // Skip over reserved prop names
    propName !== 'key' && (propName !== 'ref')) {
      props[propName] = config[propName];
    }
  } // Resolve default props


  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;

    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  return ReactElement(type, key, ref, undefined, undefined, ReactCurrentOwner.current, props);
} // While `jsxDEV` should never be called when running in production, we do

const jsx = jsxProd; // we may want to special case jsxs internally to take advantage of static children.
// for now we can ship identical prod functions

const jsxs = jsxProd;

exports.Fragment = REACT_FRAGMENT_TYPE;
exports.jsx = jsx;
exports.jsxs = jsxs;