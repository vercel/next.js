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

// src/primitives/abort-controller.js
var abort_controller_exports = {};
__export(abort_controller_exports, {
  AbortController: () => AbortController,
  AbortSignal: () => AbortSignal,
  DOMException: () => DOMException
});
module.exports = __toCommonJS(abort_controller_exports);
var import_events = require("./events");
var kSignal = Symbol("kSignal");
var kAborted = Symbol("kAborted");
var kReason = Symbol("kReason");
var kName = Symbol("kName");
var kOnabort = Symbol("kOnabort");
var DOMException = class extends Error {
  constructor(message, name) {
    super(message);
    this[kName] = name;
  }
  get name() {
    return this[kName];
  }
};
__name(DOMException, "DOMException");
function createAbortSignal() {
  const signal = new import_events.EventTarget();
  Object.setPrototypeOf(signal, AbortSignal.prototype);
  signal[kAborted] = false;
  signal[kReason] = void 0;
  signal[kOnabort] = void 0;
  return signal;
}
__name(createAbortSignal, "createAbortSignal");
function abortSignalAbort(signal, reason) {
  if (typeof reason === "undefined") {
    reason = new DOMException("The operation was aborted.", "AbortError");
  }
  if (signal.aborted) {
    return;
  }
  signal[kReason] = reason;
  signal[kAborted] = true;
  signal.dispatchEvent(new import_events.Event("abort"));
}
__name(abortSignalAbort, "abortSignalAbort");
var AbortController = class {
  constructor() {
    this[kSignal] = createAbortSignal();
  }
  get signal() {
    return this[kSignal];
  }
  abort(reason) {
    abortSignalAbort(this.signal, reason);
  }
};
__name(AbortController, "AbortController");
var AbortSignal = class extends import_events.EventTarget {
  constructor() {
    throw new TypeError("Illegal constructor.");
  }
  get aborted() {
    return this[kAborted];
  }
  get reason() {
    return this[kReason];
  }
  get onabort() {
    return this[kOnabort];
  }
  set onabort(value) {
    if (this[kOnabort]) {
      this.removeEventListener("abort", this[kOnabort]);
    }
    if (value) {
      this[kOnabort] = value;
      this.addEventListener("abort", this[kOnabort]);
    }
  }
  throwIfAborted() {
    if (this[kAborted]) {
      throw this[kReason];
    }
  }
  static abort(reason) {
    const signal = createAbortSignal();
    abortSignalAbort(signal, reason);
    return signal;
  }
  static timeout(milliseconds) {
    const signal = createAbortSignal();
    setTimeout(() => {
      abortSignalAbort(
        signal,
        new DOMException("The operation timed out.", "TimeoutError")
      );
    }, milliseconds);
    return signal;
  }
};
__name(AbortSignal, "AbortSignal");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AbortController,
  AbortSignal,
  DOMException
});
