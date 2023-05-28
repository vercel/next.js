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

// src/primitives/encoding.js
var encoding_exports = {};
__export(encoding_exports, {
  TextDecoder: () => TD,
  TextEncoder: () => TE,
  atob: () => atob,
  btoa: () => btoa
});
module.exports = __toCommonJS(encoding_exports);
var atob = /* @__PURE__ */ __name((enc) => Buffer.from(enc, "base64").toString("binary"), "atob");
var btoa = /* @__PURE__ */ __name((str) => Buffer.from(str, "binary").toString("base64"), "btoa");
var TE = TextEncoder;
var TD = TextDecoder;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TextDecoder,
  TextEncoder,
  atob,
  btoa
});
