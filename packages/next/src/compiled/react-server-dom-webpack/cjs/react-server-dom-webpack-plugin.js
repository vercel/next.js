/**
 * @license React
 * react-server-dom-webpack-plugin.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

'use strict';var k=require("path"),l=require("url"),n=require("neo-async"),p=require("webpack/lib/dependencies/ModuleDependency"),q=require("webpack/lib/dependencies/NullDependency"),r=require("webpack/lib/Template"),t=require("webpack");const u=Array.isArray;class v extends p{constructor(a){super(a)}get type(){return"client-reference"}}const w=require.resolve("../client.browser.js");
class x{constructor(a){this.manifestFilename=this.chunkName=this.clientReferences=void 0;if(!a||"boolean"!==typeof a.isServer)throw Error("React Server Plugin: You must specify the isServer option as a boolean.");if(a.isServer)throw Error("TODO: Implement the server compiler.");a.clientReferences?"string"!==typeof a.clientReferences&&u(a.clientReferences)?this.clientReferences=a.clientReferences:this.clientReferences=[a.clientReferences]:this.clientReferences=[{directory:".",recursive:!0,include:/\.(js|ts|jsx|tsx)$/}];
"string"===typeof a.chunkName?(this.chunkName=a.chunkName,/\[(index|request)\]/.test(this.chunkName)||(this.chunkName+="[index]")):this.chunkName="client[index]";this.manifestFilename=a.manifestFilename||"react-client-manifest.json"}apply(a){const e=this;let f,m=!1;a.hooks.beforeCompile.tapAsync("React Server Plugin",(c,b)=>{c=c.contextModuleFactory;const d=a.resolverFactory.get("context",{});e.resolveAllClientFiles(a.context,d,a.inputFileSystem,c,function(a,c){a?b(a):(f=c,b())})});a.hooks.thisCompilation.tap("React Server Plugin",
(a,b)=>{b=b.normalModuleFactory;a.dependencyFactories.set(v,b);a.dependencyTemplates.set(v,new q.Template);a=a=>{a.hooks.program.tap("React Server Plugin",()=>{const b=a.state.module;if(b.resource===w&&(m=!0,f))for(let a=0;a<f.length;a++){const g=f[a];var c=e.chunkName.replace(/\[index\]/g,""+a).replace(/\[request\]/g,r.toPath(g.userRequest));c=new t.AsyncDependenciesBlock({name:c},null,g.request);c.addDependency(g);b.addBlock(c)}})};b.hooks.parser.for("javascript/auto").tap("HarmonyModulesPlugin",
a);b.hooks.parser.for("javascript/esm").tap("HarmonyModulesPlugin",a);b.hooks.parser.for("javascript/dynamic").tap("HarmonyModulesPlugin",a)});a.hooks.make.tap("React Server Plugin",a=>{a.hooks.processAssets.tap({name:"React Server Plugin",stage:t.Compilation.PROCESS_ASSETS_STAGE_REPORT},function(){if(!1===m)a.warnings.push(new t.WebpackError("Client runtime at react-server-dom-webpack/client was not found. React Server Components module map file "+e.manifestFilename+" was not created."));else{var b=
{};a.chunkGroups.forEach(function(c){function d(c,h){if(/\.(js|ts)x?$/.test(h.resource)){var d=a.moduleGraph.getExportsInfo(h).getProvidedExports(),g={};["","*"].concat(Array.isArray(d)?d:[]).forEach(function(a){g[a]={id:c,chunks:e,name:a}});h=l.pathToFileURL(h.resource).href;void 0!==h&&(b[h]=g)}}const e=c.chunks.map(function(a){return a.id});c.chunks.forEach(function(b){b=a.chunkGraph.getChunkModulesIterable(b);Array.from(b).forEach(function(b){const c=a.chunkGraph.getModuleId(b);d(c,b);b.modules&&
b.modules.forEach(a=>{d(c,a)})})})});var c=JSON.stringify(b,null,2);a.emitAsset(e.manifestFilename,new t.sources.RawSource(c,!1))}})})}resolveAllClientFiles(a,e,f,m,c){n.map(this.clientReferences,(b,c)=>{"string"===typeof b?c(null,[new v(b)]):e.resolve({},a,b.directory,{},(a,d)=>{if(a)return c(a);m.resolveDependencies(f,{resource:d,resourceQuery:"",recursive:void 0===b.recursive?!0:b.recursive,regExp:b.include,include:void 0,exclude:b.exclude},(a,b)=>{if(a)return c(a);a=b.map(a=>{var b=k.join(d,a.userRequest);
b=new v(b);b.userRequest=a.userRequest;return b});c(null,a)})})},(a,d)=>{if(a)return c(a);a=[];for(let b=0;b<d.length;b++)a.push.apply(a,d[b]);c(null,a)})}}module.exports=x;
