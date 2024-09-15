/**
 * @license React
 * react-server-dom-webpack-node-register.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
const acorn = require("acorn-loose"),
  url = require("url"),
  Module = require("module");
module.exports = function () {
  const Server = require("react-server-dom-webpack/server"),
    registerServerReference = Server.registerServerReference,
    createClientModuleProxy = Server.createClientModuleProxy,
    originalCompile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (
      -1 === content.indexOf("use client") &&
      -1 === content.indexOf("use server")
    )
      return originalCompile.apply(this, arguments);
    try {
      var body = acorn.parse(content, {
        ecmaVersion: "2024",
        sourceType: "source"
      }).body;
    } catch (x) {
      return (
        console.error("Error parsing %s %s", url, x.message),
        originalCompile.apply(this, arguments)
      );
    }
    var useClient = !1,
      useServer = !1;
    for (var i = 0; i < body.length; i++) {
      var node = body[i];
      if ("ExpressionStatement" !== node.type || !node.directive) break;
      "use client" === node.directive && (useClient = !0);
      "use server" === node.directive && (useServer = !0);
    }
    if (!useClient && !useServer) return originalCompile.apply(this, arguments);
    if (useClient && useServer)
      throw Error(
        'Cannot have both "use client" and "use server" directives in the same file.'
      );
    useClient &&
      ((body = url.pathToFileURL(filename).href),
      (this.exports = createClientModuleProxy(body)));
    if (useServer)
      if (
        (originalCompile.apply(this, arguments),
        (useServer = url.pathToFileURL(filename).href),
        (body = this.exports),
        "function" === typeof body)
      )
        registerServerReference(body, useServer, null);
      else
        for (useClient = Object.keys(body), i = 0; i < useClient.length; i++) {
          node = useClient[i];
          const value = body[useClient[i]];
          "function" === typeof value &&
            registerServerReference(value, useServer, node);
        }
  };
};
