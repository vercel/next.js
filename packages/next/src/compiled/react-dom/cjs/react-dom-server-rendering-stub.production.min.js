/*
 React
 react-dom-server-rendering-stub.production.min.js

 Copyright (c) Meta Platforms, Inc. and affiliates.

 This source code is licensed under the MIT license found in the
 LICENSE file in the root directory of this source tree.
*/
'use strict';var e=require("next/dist/compiled/react"),f={usingClientEntryPoint:!1,Events:null,Dispatcher:{current:null}};function h(b){var a="https://react.dev/errors/"+b;if(1<arguments.length){a+="?args[]="+encodeURIComponent(arguments[1]);for(var c=2;c<arguments.length;c++)a+="&args[]="+encodeURIComponent(arguments[c])}return"Minified React error #"+b+"; visit "+a+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}
function k(b,a){if("font"===b)return"";if("string"===typeof a)return"use-credentials"===a?a:""}var l=f.Dispatcher,m=e.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;function n(){return m.current.useHostTransitionStatus()}function r(b,a,c){return m.current.useFormState(b,a,c)}exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=f;exports.createPortal=function(){throw Error(h(448));};exports.experimental_useFormState=function(b,a,c){return r(b,a,c)};
exports.experimental_useFormStatus=function(){return n()};exports.flushSync=function(){throw Error(h(449));};exports.preconnect=function(b,a){var c=l.current;c&&"string"===typeof b&&(a?(a=a.crossOrigin,a="string"===typeof a?"use-credentials"===a?a:"":void 0):a=null,c.preconnect(b,a))};exports.prefetchDNS=function(b){var a=l.current;a&&"string"===typeof b&&a.prefetchDNS(b)};
exports.preinit=function(b,a){var c=l.current;if(c&&"string"===typeof b&&a&&"string"===typeof a.as){var d=a.as,g=k(d,a.crossOrigin),p="string"===typeof a.integrity?a.integrity:void 0,q="string"===typeof a.fetchPriority?a.fetchPriority:void 0;"style"===d?c.preinitStyle(b,"string"===typeof a.precedence?a.precedence:void 0,{crossOrigin:g,integrity:p,fetchPriority:q}):"script"===d&&c.preinitScript(b,{crossOrigin:g,integrity:p,fetchPriority:q,nonce:"string"===typeof a.nonce?a.nonce:void 0})}};
exports.preinitModule=function(b,a){var c=l.current;if(c&&"string"===typeof b)if("object"===typeof a&&null!==a){if(null==a.as||"script"===a.as){var d=k(a.as,a.crossOrigin);c.preinitModuleScript(b,{crossOrigin:d,integrity:"string"===typeof a.integrity?a.integrity:void 0,nonce:"string"===typeof a.nonce?a.nonce:void 0})}}else null==a&&c.preinitModuleScript(b)};
exports.preload=function(b,a){var c=l.current;if(c&&"string"===typeof b&&"object"===typeof a&&null!==a&&"string"===typeof a.as){var d=a.as,g=k(d,a.crossOrigin);c.preload(b,d,{crossOrigin:g,integrity:"string"===typeof a.integrity?a.integrity:void 0,nonce:"string"===typeof a.nonce?a.nonce:void 0,type:"string"===typeof a.type?a.type:void 0,fetchPriority:"string"===typeof a.fetchPriority?a.fetchPriority:void 0,referrerPolicy:"string"===typeof a.referrerPolicy?a.referrerPolicy:void 0,imageSrcSet:"string"===
typeof a.imageSrcSet?a.imageSrcSet:void 0,imageSizes:"string"===typeof a.imageSizes?a.imageSizes:void 0})}};exports.preloadModule=function(b,a){var c=l.current;if(c&&"string"===typeof b)if(a){var d=k(a.as,a.crossOrigin);c.preloadModule(b,{as:"string"===typeof a.as&&"script"!==a.as?a.as:void 0,crossOrigin:d,integrity:"string"===typeof a.integrity?a.integrity:void 0})}else c.preloadModule(b)};exports.unstable_batchedUpdates=function(b,a){return b(a)};exports.useFormState=r;exports.useFormStatus=n;
exports.version="18.3.0-canary-178c267a4e-20241218";

//# sourceMappingURL=react-dom-server-rendering-stub.production.min.js.map
