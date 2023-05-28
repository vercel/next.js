"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/primitives/text-encoding-streams.js
var text_encoding_streams_exports = {};
__export(text_encoding_streams_exports, {
  TextDecoderStream: () => TextDecoderStream,
  TextEncoderStream: () => TextEncoderStream
});
module.exports = __toCommonJS(text_encoding_streams_exports);

// ../../node_modules/.pnpm/@stardazed+streams-text-encoding@1.0.2/node_modules/@stardazed/streams-text-encoding/dist/sd-streams-text-encoding.esm.js
var decDecoder = Symbol("decDecoder");
var decTransform = Symbol("decTransform");
var TextDecodeTransformer = class {
  constructor(decoder) {
    this.decoder_ = decoder;
  }
  transform(chunk, controller) {
    if (!(chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk))) {
      throw new TypeError("Input data must be a BufferSource");
    }
    const text = this.decoder_.decode(chunk, { stream: true });
    if (text.length !== 0) {
      controller.enqueue(text);
    }
  }
  flush(controller) {
    const text = this.decoder_.decode();
    if (text.length !== 0) {
      controller.enqueue(text);
    }
  }
};
__name(TextDecodeTransformer, "TextDecodeTransformer");
var TextDecoderStream = class {
  constructor(label, options) {
    this[decDecoder] = new TextDecoder(label, options);
    this[decTransform] = new TransformStream(new TextDecodeTransformer(this[decDecoder]));
  }
  get encoding() {
    return this[decDecoder].encoding;
  }
  get fatal() {
    return this[decDecoder].fatal;
  }
  get ignoreBOM() {
    return this[decDecoder].ignoreBOM;
  }
  get readable() {
    return this[decTransform].readable;
  }
  get writable() {
    return this[decTransform].writable;
  }
};
__name(TextDecoderStream, "TextDecoderStream");
var encEncoder = Symbol("encEncoder");
var encTransform = Symbol("encTransform");
var TextEncodeTransformer = class {
  constructor(encoder) {
    this.encoder_ = encoder;
    this.partial_ = void 0;
  }
  transform(chunk, controller) {
    let stringChunk = String(chunk);
    if (this.partial_ !== void 0) {
      stringChunk = this.partial_ + stringChunk;
      this.partial_ = void 0;
    }
    const lastCharIndex = stringChunk.length - 1;
    const lastCodeUnit = stringChunk.charCodeAt(lastCharIndex);
    if (lastCodeUnit >= 55296 && lastCodeUnit < 56320) {
      this.partial_ = String.fromCharCode(lastCodeUnit);
      stringChunk = stringChunk.substring(0, lastCharIndex);
    }
    const bytes = this.encoder_.encode(stringChunk);
    if (bytes.length !== 0) {
      controller.enqueue(bytes);
    }
  }
  flush(controller) {
    if (this.partial_) {
      controller.enqueue(this.encoder_.encode(this.partial_));
      this.partial_ = void 0;
    }
  }
};
__name(TextEncodeTransformer, "TextEncodeTransformer");
var TextEncoderStream = class {
  constructor() {
    this[encEncoder] = new TextEncoder();
    this[encTransform] = new TransformStream(new TextEncodeTransformer(this[encEncoder]));
  }
  get encoding() {
    return this[encEncoder].encoding;
  }
  get readable() {
    return this[encTransform].readable;
  }
  get writable() {
    return this[encTransform].writable;
  }
};
__name(TextEncoderStream, "TextEncoderStream");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TextDecoderStream,
  TextEncoderStream
});
