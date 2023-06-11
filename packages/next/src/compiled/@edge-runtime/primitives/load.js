"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/primitives/load.js
var load_exports = {};
__export(load_exports, {
  load: () => load
});
module.exports = __toCommonJS(load_exports);
var import_module = __toESM(require("module"));
var import_crypto = __toESM(require("crypto"));
function requireWithFakeGlobalScope(params) {
  const getModuleCode = `(function(module,exports,require,globalThis,${Object.keys(
    params.scopedContext
  ).join(",")}) {${params.sourceCode}
})`;
  const module = {
    exports: {},
    loaded: false,
    id: params.id
  };
  const moduleRequire = (import_module.default.createRequire || import_module.default.createRequireFromPath)(
    __filename
  );
  function throwingRequire(pathToRequire) {
    if (pathToRequire.startsWith("./")) {
      const moduleName = pathToRequire.replace(/^\.\//, "");
      if (!params.cache || !params.cache.has(moduleName)) {
        throw new Error(`Cannot find module '${moduleName}'`);
      }
      return params.cache.get(moduleName).exports;
    }
    return moduleRequire(pathToRequire);
  }
  __name(throwingRequire, "throwingRequire");
  throwingRequire.resolve = moduleRequire.resolve.bind(moduleRequire);
  eval(getModuleCode)(
    module,
    module.exports,
    throwingRequire,
    params.context,
    ...Object.values(params.scopedContext)
  );
  return module.exports;
}
__name(requireWithFakeGlobalScope, "requireWithFakeGlobalScope");
function load(scopedContext = {}) {
  const context = {};
  const encodingImpl = requireWithFakeGlobalScope({
    context,
    id: "encoding.js",
    sourceCode: require("./encoding.js.text.js"),
    scopedContext
  });
  assign(context, {
    TextDecoder,
    TextEncoder,
    atob: encodingImpl.atob,
    btoa: encodingImpl.btoa
  });
  const consoleImpl = requireWithFakeGlobalScope({
    context,
    id: "console.js",
    sourceCode: require("./console.js.text.js"),
    scopedContext
  });
  assign(context, { console: consoleImpl.console });
  const eventsImpl = requireWithFakeGlobalScope({
    context,
    id: "events.js",
    sourceCode: require("./events.js.text.js"),
    scopedContext
  });
  assign(context, {
    Event: eventsImpl.Event,
    EventTarget: eventsImpl.EventTarget,
    FetchEvent: eventsImpl.FetchEvent,
    // @ts-expect-error we need to add this to the type definitions maybe
    PromiseRejectionEvent: eventsImpl.PromiseRejectionEvent
  });
  const streamsImpl = requireWithFakeGlobalScope({
    context,
    id: "streams.js",
    sourceCode: require("./streams.js.text.js"),
    scopedContext: { ...scopedContext }
  });
  const textEncodingStreamImpl = requireWithFakeGlobalScope({
    context,
    id: "text-encoding-streams.js",
    sourceCode: require("./text-encoding-streams.js.text.js"),
    scopedContext: { ...streamsImpl, ...scopedContext }
  });
  assign(context, {
    ReadableStream: streamsImpl.ReadableStream,
    ReadableStreamBYOBReader: streamsImpl.ReadableStreamBYOBReader,
    ReadableStreamDefaultReader: streamsImpl.ReadableStreamDefaultReader,
    TextDecoderStream: textEncodingStreamImpl.TextDecoderStream,
    TextEncoderStream: textEncodingStreamImpl.TextEncoderStream,
    TransformStream: streamsImpl.TransformStream,
    WritableStream: streamsImpl.WritableStream,
    WritableStreamDefaultWriter: streamsImpl.WritableStreamDefaultWriter
  });
  const abortControllerImpl = requireWithFakeGlobalScope({
    context,
    id: "abort-controller.js",
    sourceCode: require("./abort-controller.js.text.js"),
    scopedContext: { ...eventsImpl, ...scopedContext }
  });
  assign(context, {
    AbortController: abortControllerImpl.AbortController,
    AbortSignal: abortControllerImpl.AbortSignal,
    DOMException: abortControllerImpl.DOMException
  });
  const urlImpl = requireWithFakeGlobalScope({
    context,
    id: "url.js",
    sourceCode: require("./url.js.text.js"),
    scopedContext: { ...scopedContext }
  });
  assign(context, {
    URL,
    URLSearchParams,
    URLPattern: urlImpl.URLPattern
  });
  const blobImpl = (() => {
    if (typeof scopedContext.Blob === "function") {
      return { Blob: scopedContext.Blob };
    }
    if (typeof Blob === "function") {
      return { Blob };
    }
    const global = {
      ...streamsImpl,
      ...scopedContext
    };
    const globalGlobal = { ...global, Blob: void 0 };
    Object.setPrototypeOf(globalGlobal, globalThis);
    global.global = globalGlobal;
    return requireWithFakeGlobalScope({
      context,
      id: "blob.js",
      sourceCode: require("./blob.js.text.js"),
      scopedContext: global
    });
  })();
  assign(context, {
    Blob: blobImpl.Blob
  });
  const structuredCloneImpl = requireWithFakeGlobalScope({
    id: "structured-clone.js",
    context,
    sourceCode: require("./structured-clone.js.text.js"),
    scopedContext: { ...streamsImpl, ...scopedContext }
  });
  assign(context, {
    structuredClone: structuredCloneImpl.structuredClone
  });
  const fetchImpl = requireWithFakeGlobalScope({
    context,
    id: "fetch.js",
    sourceCode: require("./fetch.js.text.js"),
    cache: /* @__PURE__ */ new Map([
      ["abort-controller", { exports: abortControllerImpl }],
      ["streams", { exports: streamsImpl }]
    ]),
    scopedContext: {
      global: { ...scopedContext },
      ...scopedContext,
      ...streamsImpl,
      ...urlImpl,
      ...abortControllerImpl,
      ...eventsImpl,
      structuredClone: context.structuredClone
    }
  });
  assign(context, {
    fetch: fetchImpl.fetch,
    File: fetchImpl.File,
    FormData: fetchImpl.FormData,
    Headers: fetchImpl.Headers,
    Request: fetchImpl.Request,
    Response: fetchImpl.Response,
    WebSocket: fetchImpl.WebSocket
  });
  const cryptoImpl = getCrypto(context, scopedContext);
  assign(context, {
    crypto: cryptoImpl.crypto,
    Crypto: cryptoImpl.Crypto,
    CryptoKey: cryptoImpl.CryptoKey,
    SubtleCrypto: cryptoImpl.SubtleCrypto
  });
  return context;
}
__name(load, "load");
function getCrypto(context, scopedContext) {
  if (typeof SubtleCrypto !== "undefined" || scopedContext.SubtleCrypto) {
    return {
      crypto: scopedContext.crypto || globalThis.crypto,
      Crypto: scopedContext.Crypto || globalThis.Crypto,
      CryptoKey: scopedContext.CryptoKey || globalThis.CryptoKey,
      SubtleCrypto: scopedContext.SubtleCrypto || globalThis.SubtleCrypto
    };
  } else if (
    // @ts-ignore
    import_crypto.default.webcrypto
  ) {
    const webcrypto = import_crypto.default.webcrypto;
    return {
      crypto: webcrypto,
      Crypto: webcrypto.constructor,
      CryptoKey: webcrypto.CryptoKey,
      SubtleCrypto: webcrypto.subtle.constructor
    };
  }
  return requireWithFakeGlobalScope({
    context,
    id: "crypto.js",
    sourceCode: require("./crypto.js.text.js"),
    scopedContext: {
      ...scopedContext
    }
  });
}
__name(getCrypto, "getCrypto");
function assign(context, additions) {
  Object.assign(context, additions);
}
__name(assign, "assign");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load
});
