(function(){"use strict";var e={800:function(e){
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/
var r=Object.getOwnPropertySymbols;var t=Object.prototype.hasOwnProperty;var u=Object.prototype.propertyIsEnumerable;function toObject(e){if(e===null||e===undefined){throw new TypeError("Object.assign cannot be called with null or undefined")}return Object(e)}function shouldUseNative(){try{if(!Object.assign){return false}var e=new String("abc");e[5]="de";if(Object.getOwnPropertyNames(e)[0]==="5"){return false}var r={};for(var t=0;t<10;t++){r["_"+String.fromCharCode(t)]=t}var u=Object.getOwnPropertyNames(r).map((function(e){return r[e]}));if(u.join("")!=="0123456789"){return false}var n={};"abcdefghijklmnopqrst".split("").forEach((function(e){n[e]=e}));if(Object.keys(Object.assign({},n)).join("")!=="abcdefghijklmnopqrst"){return false}return true}catch(e){return false}}e.exports=shouldUseNative()?Object.assign:function(e,n){var a;var i=toObject(e);var s;for(var c=1;c<arguments.length;c++){a=Object(arguments[c]);for(var o in a){if(t.call(a,o)){i[o]=a[o]}}if(r){s=r(a);for(var f=0;f<s.length;f++){if(u.call(a,s[f])){i[s[f]]=a[s[f]]}}}}return i}},569:function(e,r,t){
/** @license React vundefined
 * use-subscription.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
if(process.env.NODE_ENV!=="production"){(function(){"use strict";var e=t(800);var u=t(522);function useSubscription(r){var t=r.getCurrentValue,n=r.subscribe;var a=u.useState((function(){return{getCurrentValue:t,subscribe:n,value:t()}})),i=a[0],s=a[1];var c=i.value;if(i.getCurrentValue!==t||i.subscribe!==n){c=t();s({getCurrentValue:t,subscribe:n,value:c})}u.useDebugValue(c);u.useEffect((function(){var r=false;var checkForUpdates=function(){if(r){return}var u=t();s((function(r){if(r.getCurrentValue!==t||r.subscribe!==n){return r}if(r.value===u){return r}return e({},r,{value:u})}))};var u=n(checkForUpdates);checkForUpdates();return function(){r=true;u()}}),[t,n]);return c}r.useSubscription=useSubscription})()}},403:function(e,r,t){
/** @license React vundefined
 * use-subscription.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var u=t(800),n=t(522);r.useSubscription=function(e){var r=e.getCurrentValue,t=e.subscribe,a=n.useState((function(){return{getCurrentValue:r,subscribe:t,value:r()}}));e=a[0];var i=a[1];a=e.value;if(e.getCurrentValue!==r||e.subscribe!==t)a=r(),i({getCurrentValue:r,subscribe:t,value:a});n.useDebugValue(a);n.useEffect((function(){function b(){if(!e){var n=r();i((function(e){return e.getCurrentValue!==r||e.subscribe!==t||e.value===n?e:u({},e,{value:n})}))}}var e=!1,n=t(b);b();return function(){e=!0;n()}}),[r,t]);return a}},138:function(e,r,t){if(process.env.NODE_ENV==="production"){e.exports=t(403)}else{e.exports=t(569)}},522:function(e){e.exports=require("react")}};var r={};function __nccwpck_require__(t){var u=r[t];if(u!==undefined){return u.exports}var n=r[t]={exports:{}};var a=true;try{e[t](n,n.exports,__nccwpck_require__);a=false}finally{if(a)delete r[t]}return n.exports}if(typeof __nccwpck_require__!=="undefined")__nccwpck_require__.ab=__dirname+"/";var t=__nccwpck_require__(138);module.exports=t})();