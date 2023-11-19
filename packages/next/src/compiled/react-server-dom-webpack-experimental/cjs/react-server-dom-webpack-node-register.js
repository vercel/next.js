/*
 React
 react-server-dom-webpack-node-register.js

 Copyright (c) Meta Platforms, Inc. and affiliates.

 This source code is licensed under the MIT license found in the
 LICENSE file in the root directory of this source tree.
*/
'use strict';const h=require("acorn-loose"),l=require("url"),q=require("module");
module.exports=function(){const m=require("react-server-dom-webpack/server"),n=m.registerServerReference,r=m.createClientModuleProxy,f=q.prototype._compile;q.prototype._compile=function(k,p){if(-1===k.indexOf("use client")&&-1===k.indexOf("use server"))return f.apply(this,arguments);try{var a=h.parse(k,{ecmaVersion:"2024",sourceType:"source"}).body}catch(g){return console.error("Error parsing %s %s",l,g.message),f.apply(this,arguments)}var b=!1,d=!1;for(var c=0;c<a.length;c++){var e=a[c];if("ExpressionStatement"!==
e.type||!e.directive)break;"use client"===e.directive&&(b=!0);"use server"===e.directive&&(d=!0)}if(!b&&!d)return f.apply(this,arguments);if(b&&d)throw Error('Cannot have both "use client" and "use server" directives in the same file.');b&&(a=l.pathToFileURL(p).href,this.exports=r(a));if(d)if(f.apply(this,arguments),d=l.pathToFileURL(p).href,a=this.exports,"function"===typeof a)n(a,d,null);else for(b=Object.keys(a),c=0;c<b.length;c++){e=b[c];const g=a[b[c]];"function"===typeof g&&n(g,d,e)}}};

//# sourceMappingURL=react-server-dom-webpack-node-register.js.map
