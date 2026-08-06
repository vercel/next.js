/**
 * @license React
 * react-jsx-runtime.profiling.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
  REACT_OPTIMISTIC_KEY = Symbol.for("react.optimistic_key");
function jsxProd(type, config, maybeKey) {
  var key = null;
  void 0 !== maybeKey &&
    (key =
      maybeKey === REACT_OPTIMISTIC_KEY ? REACT_OPTIMISTIC_KEY : "" + maybeKey);
  void 0 !== config.key &&
    (key =
      maybeKey === REACT_OPTIMISTIC_KEY
        ? REACT_OPTIMISTIC_KEY
        : "" + config.key);
  if ("key" in config) {
    maybeKey = {};
    for (var propName in config)
      "key" !== propName && (maybeKey[propName] = config[propName]);
  } else maybeKey = config;
  config = maybeKey.ref;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: key,
    ref: void 0 !== config ? config : null,
    props: maybeKey
  };
}
exports.Fragment = REACT_FRAGMENT_TYPE;
exports.jsx = jsxProd;
exports.jsxs = jsxProd;
