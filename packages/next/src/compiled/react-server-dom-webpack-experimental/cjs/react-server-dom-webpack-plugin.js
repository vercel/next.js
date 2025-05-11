/**
 * @license React
 * react-server-dom-webpack-plugin.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var path = require("path"),
  url = require("url"),
  asyncLib = require("neo-async"),
  acorn = require("acorn-loose"),
  ModuleDependency = require("webpack/lib/dependencies/ModuleDependency"),
  NullDependency = require("webpack/lib/dependencies/NullDependency"),
  Template = require("webpack/lib/Template"),
  webpack = require("webpack");
function _unsupportedIterableToArray(o, minLen) {
  if (o) {
    if ("string" === typeof o) return _arrayLikeToArray(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    "Object" === n && o.constructor && (n = o.constructor.name);
    if ("Map" === n || "Set" === n) return Array.from(o);
    if ("Arguments" === n || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
      return _arrayLikeToArray(o, minLen);
  }
}
function _arrayLikeToArray(arr, len) {
  if (null == len || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}
function _createForOfIteratorHelper(o, allowArrayLike) {
  var it =
    ("undefined" !== typeof Symbol && o[Symbol.iterator]) || o["@@iterator"];
  if (!it) {
    if (
      Array.isArray(o) ||
      (it = _unsupportedIterableToArray(o)) ||
      (allowArrayLike && o && "number" === typeof o.length)
    ) {
      it && (o = it);
      var i = 0;
      allowArrayLike = function () {};
      return {
        s: allowArrayLike,
        n: function () {
          return i >= o.length ? { done: !0 } : { done: !1, value: o[i++] };
        },
        e: function (e) {
          throw e;
        },
        f: allowArrayLike
      };
    }
    throw new TypeError(
      "Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."
    );
  }
  var normalCompletion = !0,
    didErr = !1,
    err;
  return {
    s: function () {
      it = it.call(o);
    },
    n: function () {
      var step = it.next();
      normalCompletion = step.done;
      return step;
    },
    e: function (e) {
      didErr = !0;
      err = e;
    },
    f: function () {
      try {
        normalCompletion || null == it.return || it.return();
      } finally {
        if (didErr) throw err;
      }
    }
  };
}
const isArrayImpl = Array.isArray;
class ClientReferenceDependency extends ModuleDependency {
  constructor(request) {
    super(request);
  }
  get type() {
    return "client-reference";
  }
}
const clientFileName = require.resolve("../client.browser.js");
class ReactFlightWebpackPlugin {
  constructor(options) {
    this.serverConsumerManifestFilename =
      this.clientManifestFilename =
      this.chunkName =
      this.clientReferences =
        void 0;
    if (!options || "boolean" !== typeof options.isServer)
      throw Error(
        "React Server Plugin: You must specify the isServer option as a boolean."
      );
    if (options.isServer) throw Error("TODO: Implement the server compiler.");
    options.clientReferences
      ? "string" !== typeof options.clientReferences &&
        isArrayImpl(options.clientReferences)
        ? (this.clientReferences = options.clientReferences)
        : (this.clientReferences = [options.clientReferences])
      : (this.clientReferences = [
          { directory: ".", recursive: !0, include: /\.(js|ts|jsx|tsx)$/ }
        ]);
    "string" === typeof options.chunkName
      ? ((this.chunkName = options.chunkName),
        /\[(index|request)\]/.test(this.chunkName) ||
          (this.chunkName += "[index]"))
      : (this.chunkName = "client[index]");
    this.clientManifestFilename =
      options.clientManifestFilename || "react-client-manifest.json";
    this.serverConsumerManifestFilename =
      options.serverConsumerManifestFilename || "react-ssr-manifest.json";
  }
  apply(compiler) {
    const _this = this;
    let resolvedClientReferences,
      clientFileNameFound = !1;
    compiler.hooks.beforeCompile.tapAsync(
      "React Server Plugin",
      (_ref, callback) => {
        _ref = _ref.contextModuleFactory;
        const contextResolver = compiler.resolverFactory.get("context", {}),
          normalResolver = compiler.resolverFactory.get("normal");
        _this.resolveAllClientFiles(
          compiler.context,
          contextResolver,
          normalResolver,
          compiler.inputFileSystem,
          _ref,
          function (err, resolvedClientRefs) {
            err
              ? callback(err)
              : ((resolvedClientReferences = resolvedClientRefs), callback());
          }
        );
      }
    );
    compiler.hooks.thisCompilation.tap(
      "React Server Plugin",
      (compilation, _ref2) => {
        _ref2 = _ref2.normalModuleFactory;
        compilation.dependencyFactories.set(ClientReferenceDependency, _ref2);
        compilation.dependencyTemplates.set(
          ClientReferenceDependency,
          new NullDependency.Template()
        );
        compilation = (parser) => {
          parser.hooks.program.tap("React Server Plugin", () => {
            const module = parser.state.module;
            if (
              module.resource === clientFileName &&
              ((clientFileNameFound = !0), resolvedClientReferences)
            )
              for (let i = 0; i < resolvedClientReferences.length; i++) {
                const dep = resolvedClientReferences[i];
                var chunkName = _this.chunkName
                  .replace(/\[index\]/g, "" + i)
                  .replace(/\[request\]/g, Template.toPath(dep.userRequest));
                chunkName = new webpack.AsyncDependenciesBlock(
                  { name: chunkName },
                  null,
                  dep.request
                );
                chunkName.addDependency(dep);
                module.addBlock(chunkName);
              }
          });
        };
        _ref2.hooks.parser
          .for("javascript/auto")
          .tap("HarmonyModulesPlugin", compilation);
        _ref2.hooks.parser
          .for("javascript/esm")
          .tap("HarmonyModulesPlugin", compilation);
        _ref2.hooks.parser
          .for("javascript/dynamic")
          .tap("HarmonyModulesPlugin", compilation);
      }
    );
    compiler.hooks.make.tap("React Server Plugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "React Server Plugin",
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT
        },
        function () {
          if (!1 === clientFileNameFound)
            compilation.warnings.push(
              new webpack.WebpackError(
                "Client runtime at react-server-dom-webpack/client was not found. React Server Components module map file " +
                  _this.clientManifestFilename +
                  " was not created."
              )
            );
          else {
            var configuredCrossOriginLoading =
              compilation.outputOptions.crossOriginLoading;
            configuredCrossOriginLoading =
              "string" === typeof configuredCrossOriginLoading
                ? "use-credentials" === configuredCrossOriginLoading
                  ? configuredCrossOriginLoading
                  : "anonymous"
                : null;
            var resolvedClientFiles = new Set(
                (resolvedClientReferences || []).map((ref) => ref.request)
              ),
              clientManifest = {},
              moduleMap = {};
            configuredCrossOriginLoading = {
              moduleLoading: {
                prefix: compilation.outputOptions.publicPath || "",
                crossOrigin: configuredCrossOriginLoading
              },
              moduleMap
            };
            var runtimeChunkFiles = new Set();
            compilation.entrypoints.forEach((entrypoint) => {
              (entrypoint = entrypoint.getRuntimeChunk()) &&
                entrypoint.files.forEach((runtimeFile) => {
                  runtimeChunkFiles.add(runtimeFile);
                });
            });
            compilation.chunkGroups.forEach(function (chunkGroup) {
              function recordModule(id, module) {
                if (
                  resolvedClientFiles.has(module.resource) &&
                  ((module = url.pathToFileURL(module.resource).href),
                  void 0 !== module)
                ) {
                  const ssrExports = {};
                  clientManifest[module] = { id, chunks, name: "*" };
                  ssrExports["*"] = { specifier: module, name: "*" };
                  moduleMap[id] = ssrExports;
                }
              }
              const chunks = [];
              chunkGroup.chunks.forEach(function (c) {
                var _iterator = _createForOfIteratorHelper(c.files),
                  _step;
                try {
                  for (_iterator.s(); !(_step = _iterator.n()).done; ) {
                    const file = _step.value;
                    if (!file.endsWith(".js")) break;
                    if (file.endsWith(".hot-update.js")) break;
                    chunks.push(c.id, file);
                    break;
                  }
                } catch (err) {
                  _iterator.e(err);
                } finally {
                  _iterator.f();
                }
              });
              chunkGroup.chunks.forEach(function (chunk) {
                chunk = compilation.chunkGraph.getChunkModulesIterable(chunk);
                Array.from(chunk).forEach(function (module) {
                  const moduleId = compilation.chunkGraph.getModuleId(module);
                  recordModule(moduleId, module);
                  module.modules &&
                    module.modules.forEach((concatenatedMod) => {
                      recordModule(moduleId, concatenatedMod);
                    });
                });
              });
            });
            var clientOutput = JSON.stringify(clientManifest, null, 2);
            compilation.emitAsset(
              _this.clientManifestFilename,
              new webpack.sources.RawSource(clientOutput, !1)
            );
            configuredCrossOriginLoading = JSON.stringify(
              configuredCrossOriginLoading,
              null,
              2
            );
            compilation.emitAsset(
              _this.serverConsumerManifestFilename,
              new webpack.sources.RawSource(configuredCrossOriginLoading, !1)
            );
          }
        }
      );
    });
  }
  resolveAllClientFiles(
    context,
    contextResolver,
    normalResolver,
    fs,
    contextModuleFactory,
    callback
  ) {
    function hasUseClientDirective(source) {
      if (-1 === source.indexOf("use client")) return !1;
      let body;
      try {
        body = acorn.parse(source, {
          ecmaVersion: "2024",
          sourceType: "module"
        }).body;
      } catch (x) {
        return !1;
      }
      for (source = 0; source < body.length; source++) {
        const node = body[source];
        if ("ExpressionStatement" !== node.type || !node.directive) break;
        if ("use client" === node.directive) return !0;
      }
      return !1;
    }
    asyncLib.map(
      this.clientReferences,
      (clientReferencePath, cb) => {
        "string" === typeof clientReferencePath
          ? cb(null, [new ClientReferenceDependency(clientReferencePath)])
          : contextResolver.resolve(
              {},
              context,
              clientReferencePath.directory,
              {},
              (err, resolvedDirectory) => {
                if (err) return cb(err);
                contextModuleFactory.resolveDependencies(
                  fs,
                  {
                    resource: resolvedDirectory,
                    resourceQuery: "",
                    recursive:
                      void 0 === clientReferencePath.recursive
                        ? !0
                        : clientReferencePath.recursive,
                    regExp: clientReferencePath.include,
                    include: void 0,
                    exclude: clientReferencePath.exclude
                  },
                  (err2, deps) => {
                    if (err2) return cb(err2);
                    err2 = deps.map((dep) => {
                      var request = path.join(
                        resolvedDirectory,
                        dep.userRequest
                      );
                      request = new ClientReferenceDependency(request);
                      request.userRequest = dep.userRequest;
                      return request;
                    });
                    asyncLib.filter(
                      err2,
                      (clientRefDep, filterCb) => {
                        normalResolver.resolve(
                          {},
                          context,
                          clientRefDep.request,
                          {},
                          (err3, resolvedPath) => {
                            if (err3 || "string" !== typeof resolvedPath)
                              return filterCb(null, !1);
                            fs.readFile(
                              resolvedPath,
                              "utf-8",
                              (err4, content) => {
                                if (err4 || "string" !== typeof content)
                                  return filterCb(null, !1);
                                err4 = hasUseClientDirective(content);
                                filterCb(null, err4);
                              }
                            );
                          }
                        );
                      },
                      cb
                    );
                  }
                );
              }
            );
      },
      (err, result) => {
        if (err) return callback(err);
        err = [];
        for (let i = 0; i < result.length; i++) err.push.apply(err, result[i]);
        callback(null, err);
      }
    );
  }
}
module.exports = ReactFlightWebpackPlugin;
