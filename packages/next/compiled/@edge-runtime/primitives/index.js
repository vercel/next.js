"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/primitives/index.js
var primitives_exports = {};
module.exports = __toCommonJS(primitives_exports);
__reExport(primitives_exports, require("./abort-controller"), module.exports);
__reExport(primitives_exports, require("./blob"), module.exports);
__reExport(primitives_exports, require("./cache"), module.exports);
__reExport(primitives_exports, require("./console"), module.exports);
__reExport(primitives_exports, require("./crypto"), module.exports);
__reExport(primitives_exports, require("./encoding"), module.exports);
__reExport(primitives_exports, require("./events"), module.exports);
__reExport(primitives_exports, require("./fetch"), module.exports);
__reExport(primitives_exports, require("./streams"), module.exports);
__reExport(primitives_exports, require("./structured-clone"), module.exports);
__reExport(primitives_exports, require("./url"), module.exports);
