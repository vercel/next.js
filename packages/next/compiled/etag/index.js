module.exports=(()=>{"use strict";var t={474:(t,e,r)=>{t.exports=etag;var i=r(417);var n=r(747).Stats;var a=Object.prototype.toString;function entitytag(t){if(t.length===0){return'"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"'}var e=i.createHash("sha1").update(t,"utf8").digest("base64").substring(0,27);var r=typeof t==="string"?Buffer.byteLength(t,"utf8"):t.length;return'"'+r.toString(16)+"-"+e+'"'}function etag(t,e){if(t==null){throw new TypeError("argument entity is required")}var r=isstats(t);var i=e&&typeof e.weak==="boolean"?e.weak:r;if(!r&&typeof t!=="string"&&!Buffer.isBuffer(t)){throw new TypeError("argument entity must be string, Buffer, or fs.Stats")}var n=r?stattag(t):entitytag(t);return i?"W/"+n:n}function isstats(t){if(typeof n==="function"&&t instanceof n){return true}return t&&typeof t==="object"&&"ctime"in t&&a.call(t.ctime)==="[object Date]"&&"mtime"in t&&a.call(t.mtime)==="[object Date]"&&"ino"in t&&typeof t.ino==="number"&&"size"in t&&typeof t.size==="number"}function stattag(t){var e=t.mtime.getTime().toString(16);var r=t.size.toString(16);return'"'+r+"-"+e+'"'}},417:t=>{t.exports=require("crypto")},747:t=>{t.exports=require("fs")}};var e={};function __webpack_require__(r){if(e[r]){return e[r].exports}var i=e[r]={exports:{}};var n=true;try{t[r](i,i.exports,__webpack_require__);n=false}finally{if(n)delete e[r]}return i.exports}__webpack_require__.ab=__dirname+"/";return __webpack_require__(474)})();