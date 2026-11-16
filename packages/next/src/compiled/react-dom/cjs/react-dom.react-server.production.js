/**
 * @license React
 * react-dom.react-server.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var React = require("next/dist/compiled/react");
function noop() {}
var Internals = {
  d: {
    f: noop,
    r: function () {
      throw Error(
        "Invalid form element. requestFormReset must be passed a form that was rendered by React."
      );
    },
    D: noop,
    C: noop,
    L: noop,
    m: noop,
    X: noop,
    S: noop,
    M: noop
  },
  p: 0,
  findDOMNode: null
};
if (!React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE)
  throw Error(
    'The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled in any environment that runs React Server Components.'
  );
var hasOwnProperty = Object.prototype.hasOwnProperty,
  VALID_ATTRIBUTE_NAME_REGEX = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ),
  illegalAttributeNameCache = {},
  validatedAttributeNameCache = {};
function isAttributeNameSafe(attributeName) {
  if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
    return !0;
  if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return !1;
  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
    return (validatedAttributeNameCache[attributeName] = !0);
  illegalAttributeNameCache[attributeName] = !0;
  return !1;
}
function getCrossOriginStringAs(as, input) {
  if ("font" === as) return "";
  if ("string" === typeof input)
    return "use-credentials" === input ? input : "";
}
exports.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
  Internals;
exports.preconnect = function (href, options) {
  "string" === typeof href &&
    (options
      ? ((options = options.crossOrigin),
        (options =
          "string" === typeof options
            ? "use-credentials" === options
              ? options
              : ""
            : void 0))
      : (options = null),
    Internals.d.C(href, options));
};
exports.prefetchDNS = function (href) {
  "string" === typeof href && Internals.d.D(href);
};
exports.preinit = function (href, options) {
  if ("string" === typeof href && options && "string" === typeof options.as) {
    var as = options.as,
      crossOrigin = getCrossOriginStringAs(as, options.crossOrigin),
      integrity =
        "string" === typeof options.integrity ? options.integrity : void 0,
      fetchPriority =
        "string" === typeof options.fetchPriority
          ? options.fetchPriority
          : void 0;
    if ("style" === as)
      Internals.d.S(
        href,
        "string" === typeof options.precedence ? options.precedence : void 0,
        {
          crossOrigin: crossOrigin,
          integrity: integrity,
          fetchPriority: fetchPriority
        }
      );
    else if ("script" === as) {
      as = {
        crossOrigin: crossOrigin,
        integrity: integrity,
        fetchPriority: fetchPriority,
        nonce: "string" === typeof options.nonce ? options.nonce : void 0
      };
      if (
        null != options.dataAttributes &&
        ((options = options.dataAttributes), "object" === typeof options)
      )
        for (var name in options)
          hasOwnProperty.call(options, name) &&
            ((crossOrigin = options[name]),
            5 >= name.length ||
              !name.startsWith("data-") ||
              (isAttributeNameSafe(name) &&
                "string" === typeof crossOrigin &&
                (as[name] = crossOrigin)));
      Internals.d.X(href, as);
    }
  }
};
exports.preinitModule = function (href, options) {
  if ("string" === typeof href)
    if ("object" === typeof options && null !== options) {
      if (null == options.as || "script" === options.as) {
        var crossOrigin = getCrossOriginStringAs(
          options.as,
          options.crossOrigin
        );
        Internals.d.M(href, {
          crossOrigin: crossOrigin,
          integrity:
            "string" === typeof options.integrity ? options.integrity : void 0,
          nonce: "string" === typeof options.nonce ? options.nonce : void 0,
          fetchPriority:
            "string" === typeof options.fetchPriority
              ? options.fetchPriority
              : void 0
        });
      }
    } else null == options && Internals.d.M(href);
};
exports.preload = function (href, options) {
  if (
    "string" === typeof href &&
    "object" === typeof options &&
    null !== options &&
    "string" === typeof options.as
  ) {
    var as = options.as,
      crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
    Internals.d.L(href, as, {
      crossOrigin: crossOrigin,
      integrity:
        "string" === typeof options.integrity ? options.integrity : void 0,
      nonce: "string" === typeof options.nonce ? options.nonce : void 0,
      type: "string" === typeof options.type ? options.type : void 0,
      fetchPriority:
        "string" === typeof options.fetchPriority
          ? options.fetchPriority
          : void 0,
      referrerPolicy:
        "string" === typeof options.referrerPolicy
          ? options.referrerPolicy
          : void 0,
      imageSrcSet:
        "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
      imageSizes:
        "string" === typeof options.imageSizes ? options.imageSizes : void 0,
      media: "string" === typeof options.media ? options.media : void 0
    });
  }
};
exports.preloadModule = function (href, options) {
  if ("string" === typeof href)
    if (options) {
      var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
      Internals.d.m(href, {
        as:
          "string" === typeof options.as && "script" !== options.as
            ? options.as
            : void 0,
        crossOrigin: crossOrigin,
        integrity:
          "string" === typeof options.integrity ? options.integrity : void 0,
        nonce: "string" === typeof options.nonce ? options.nonce : void 0,
        fetchPriority:
          "string" === typeof options.fetchPriority
            ? options.fetchPriority
            : void 0
      });
    } else Internals.d.m(href);
};
exports.version = "19.3.0";
