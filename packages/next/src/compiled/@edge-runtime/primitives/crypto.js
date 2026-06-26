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

// src/primitives/crypto.js
var crypto_exports = {};
__export(crypto_exports, {
  Crypto: () => Crypto,
  CryptoKey: () => CryptoKey,
  SubtleCrypto: () => SubtleCrypto,
  crypto: () => crypto
});
module.exports = __toCommonJS(crypto_exports);
var import_node_crypto = require("crypto");
var { Crypto, CryptoKey } = import_node_crypto.webcrypto;
function SubtleCrypto() {
  if (!(this instanceof SubtleCrypto))
    return new SubtleCrypto();
  throw TypeError("Illegal constructor");
}
__name(SubtleCrypto, "SubtleCrypto");
var crypto = new Crypto();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Crypto,
  CryptoKey,
  SubtleCrypto,
  crypto
});
