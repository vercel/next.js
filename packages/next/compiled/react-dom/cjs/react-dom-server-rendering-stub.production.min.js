/**
 * @license React
 * react-dom-server-rendering-stub.production.min.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';var b={usingClientEntryPoint:!1,Events:null,Dispatcher:{current:null}};function d(a){for(var e="https://reactjs.org/docs/error-decoder.html?invariant="+a,c=1;c<arguments.length;c++)e+="&args[]="+encodeURIComponent(arguments[c]);return"Minified React error #"+a+"; visit "+e+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=b;
exports.createPortal=function(){throw Error(d(448));};exports.flushSync=function(){throw Error(d(449));};exports.preinit=function(){var a=b.Dispatcher.current;a&&a.preinit.apply(this,arguments)};exports.preload=function(){var a=b.Dispatcher.current;a&&a.preload.apply(this,arguments)};exports.version="18.3.0-next-3ba7add60-20221201";
