"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/primitives/stream.js
var stream_exports = {};
__export(stream_exports, {
  ReadableStream: () => import_web.ReadableStream,
  ReadableStreamBYOBReader: () => import_web.ReadableStreamBYOBReader,
  ReadableStreamDefaultReader: () => import_web.ReadableStreamDefaultReader,
  TextDecoderStream: () => import_web.TextDecoderStream,
  TextEncoderStream: () => import_web.TextEncoderStream,
  TransformStream: () => import_web.TransformStream,
  WritableStream: () => import_web.WritableStream,
  WritableStreamDefaultWriter: () => import_web.WritableStreamDefaultWriter
});
module.exports = __toCommonJS(stream_exports);
var import_web = require("stream/web");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ReadableStream,
  ReadableStreamBYOBReader,
  ReadableStreamDefaultReader,
  TextDecoderStream,
  TextEncoderStream,
  TransformStream,
  WritableStream,
  WritableStreamDefaultWriter
});
