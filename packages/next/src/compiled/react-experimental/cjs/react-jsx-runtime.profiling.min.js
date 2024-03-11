/*
 React
 react-jsx-runtime.profiling.min.js

 Copyright (c) Meta Platforms, Inc. and affiliates.

 This source code is licensed under the MIT license found in the
 LICENSE file in the root directory of this source tree.
*/
'use strict';var f=require("next/dist/compiled/react-experimental"),h=Symbol.for("react.element"),k=Symbol.for("react.fragment"),l=Object.prototype.hasOwnProperty,m=f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;
function n(d,b,g){var c={},e=null;void 0!==g&&(e=""+g);void 0!==b.key&&(e=""+b.key);for(a in b)l.call(b,a)&&"key"!==a&&(c[a]=b[a]);if(d&&d.defaultProps)for(a in b=d.defaultProps,b)void 0===c[a]&&(c[a]=b[a]);var a=c.ref;return{$$typeof:h,type:d,key:e,ref:void 0!==a?a:null,props:c,_owner:m.current}}exports.Fragment=k;exports.jsx=n;exports.jsxs=n;

//# sourceMappingURL=react-jsx-runtime.profiling.min.js.map
