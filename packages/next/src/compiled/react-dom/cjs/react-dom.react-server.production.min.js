/*
 React
 react-dom.react-server.production.min.js

 Copyright (c) Meta Platforms, Inc. and affiliates.

 This source code is licensed under the MIT license found in the
 LICENSE file in the root directory of this source tree.
*/
'use strict';var e={usingClientEntryPoint:!1,Events:null,Dispatcher:{current:null}};function f(b,a){if("font"===b)return"";if("string"===typeof a)return"use-credentials"===a?a:""}var h=e.Dispatcher;exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=e;exports.preconnect=function(b,a){var c=h.current;c&&"string"===typeof b&&(a?(a=a.crossOrigin,a="string"===typeof a?"use-credentials"===a?a:"":void 0):a=null,c.preconnect(b,a))};
exports.prefetchDNS=function(b){var a=h.current;a&&"string"===typeof b&&a.prefetchDNS(b)};
exports.preinit=function(b,a){var c=h.current;if(c&&"string"===typeof b&&a&&"string"===typeof a.as){var d=a.as,g=f(d,a.crossOrigin),k="string"===typeof a.integrity?a.integrity:void 0,l="string"===typeof a.fetchPriority?a.fetchPriority:void 0;"style"===d?c.preinitStyle(b,"string"===typeof a.precedence?a.precedence:void 0,{crossOrigin:g,integrity:k,fetchPriority:l}):"script"===d&&c.preinitScript(b,{crossOrigin:g,integrity:k,fetchPriority:l,nonce:"string"===typeof a.nonce?a.nonce:void 0})}};
exports.preinitModule=function(b,a){var c=h.current;if(c&&"string"===typeof b)if("object"===typeof a&&null!==a){if(null==a.as||"script"===a.as){var d=f(a.as,a.crossOrigin);c.preinitModuleScript(b,{crossOrigin:d,integrity:"string"===typeof a.integrity?a.integrity:void 0,nonce:"string"===typeof a.nonce?a.nonce:void 0})}}else null==a&&c.preinitModuleScript(b)};
exports.preload=function(b,a){var c=h.current;if(c&&"string"===typeof b&&"object"===typeof a&&null!==a&&"string"===typeof a.as){var d=a.as,g=f(d,a.crossOrigin);c.preload(b,d,{crossOrigin:g,integrity:"string"===typeof a.integrity?a.integrity:void 0,nonce:"string"===typeof a.nonce?a.nonce:void 0,type:"string"===typeof a.type?a.type:void 0,fetchPriority:"string"===typeof a.fetchPriority?a.fetchPriority:void 0,referrerPolicy:"string"===typeof a.referrerPolicy?a.referrerPolicy:void 0,imageSrcSet:"string"===
typeof a.imageSrcSet?a.imageSrcSet:void 0,imageSizes:"string"===typeof a.imageSizes?a.imageSizes:void 0})}};exports.preloadModule=function(b,a){var c=h.current;if(c&&"string"===typeof b)if(a){var d=f(a.as,a.crossOrigin);c.preloadModule(b,{as:"string"===typeof a.as&&"script"!==a.as?a.as:void 0,crossOrigin:d,integrity:"string"===typeof a.integrity?a.integrity:void 0})}else c.preloadModule(b)};

//# sourceMappingURL=react-dom.react-server.production.min.js.map
