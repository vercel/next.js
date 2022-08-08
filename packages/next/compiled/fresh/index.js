(()=>{"use strict";var e={98:e=>{
/*!
 * fresh
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2016-2017 Douglas Christopher Wilson
 * MIT Licensed
 */
var r=/(?:^|,)\s*?no-cache\s*?(?:,|$)/;e.exports=fresh;function fresh(e,a){var t=e["if-modified-since"];var s=e["if-none-match"];if(!t&&!s){return false}var i=e["cache-control"];if(i&&r.test(i)){return false}if(s&&s!=="*"){var f=a["etag"];if(!f){return false}var n=true;var u=parseTokenList(s);for(var _=0;_<u.length;_++){var o=u[_];if(o===f||o==="W/"+f||"W/"+o===f){n=false;break}}if(n){return false}}if(t){var p=a["last-modified"];var v=!p||!(parseHttpDate(p)<=parseHttpDate(t));if(v){return false}}return true}function parseHttpDate(e){var r=e&&Date.parse(e);return typeof r==="number"?r:NaN}function parseTokenList(e){var r=0;var a=[];var t=0;for(var s=0,i=e.length;s<i;s++){switch(e.charCodeAt(s)){case 32:if(t===r){t=r=s+1}break;case 44:a.push(e.substring(t,r));t=r=s+1;break;default:r=s+1;break}}a.push(e.substring(t,r));return a}}};var r={};function __nccwpck_require__(a){var t=r[a];if(t!==undefined){return t.exports}var s=r[a]={exports:{}};var i=true;try{e[a](s,s.exports,__nccwpck_require__);i=false}finally{if(i)delete r[a]}return s.exports}if(typeof __nccwpck_require__!=="undefined")__nccwpck_require__.ab=__dirname+"/";var a=__nccwpck_require__(98);module.exports=a})();