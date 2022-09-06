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

// src/primitives/events.js
var events_exports = {};
__export(events_exports, {
  Event: () => Event,
  EventTarget: () => EventTarget,
  FetchEvent: () => FetchEvent,
  PromiseRejectionEvent: () => PromiseRejectionEvent
});
module.exports = __toCommonJS(events_exports);

// <define:process>
var define_process_default = { env: {}, versions: { node: "16.6.0" } };

// ../../node_modules/.pnpm/event-target-shim@6.0.2/node_modules/event-target-shim/index.mjs
function assertType(condition, message, ...args) {
  if (!condition) {
    throw new TypeError(format(message, args));
  }
}
__name(assertType, "assertType");
function format(message, args) {
  let i = 0;
  return message.replace(/%[os]/gu, () => anyToString(args[i++]));
}
__name(format, "format");
function anyToString(x) {
  if (typeof x !== "object" || x === null) {
    return String(x);
  }
  return Object.prototype.toString.call(x);
}
__name(anyToString, "anyToString");
var currentErrorHandler;
function reportError(maybeError) {
  try {
    const error = maybeError instanceof Error ? maybeError : new Error(anyToString(maybeError));
    if (currentErrorHandler) {
      currentErrorHandler(error);
      return;
    }
    if (typeof dispatchEvent === "function" && typeof ErrorEvent === "function") {
      dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
    } else if (typeof define_process_default !== "undefined" && typeof define_process_default.emit === "function") {
      define_process_default.emit("uncaughtException", error);
      return;
    }
    console.error(error);
  } catch (_a) {
  }
}
__name(reportError, "reportError");
var Global = typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : typeof global !== "undefined" ? global : typeof globalThis !== "undefined" ? globalThis : void 0;
var currentWarnHandler;
var Warning = class {
  constructor(code, message) {
    this.code = code;
    this.message = message;
  }
  warn(...args) {
    var _a;
    try {
      if (currentWarnHandler) {
        currentWarnHandler({ ...this, args });
        return;
      }
      const stack = ((_a = new Error().stack) !== null && _a !== void 0 ? _a : "").replace(/^(?:.+?\n){2}/gu, "\n");
      console.warn(this.message, ...args, stack);
    } catch (_b) {
    }
  }
};
__name(Warning, "Warning");
var InitEventWasCalledWhileDispatching = new Warning("W01", "Unable to initialize event under dispatching.");
var FalsyWasAssignedToCancelBubble = new Warning("W02", "Assigning any falsy value to 'cancelBubble' property has no effect.");
var TruthyWasAssignedToReturnValue = new Warning("W03", "Assigning any truthy value to 'returnValue' property has no effect.");
var NonCancelableEventWasCanceled = new Warning("W04", "Unable to preventDefault on non-cancelable events.");
var CanceledInPassiveListener = new Warning("W05", "Unable to preventDefault inside passive event listener invocation.");
var EventListenerWasDuplicated = new Warning("W06", "An event listener wasn't added because it has been added already: %o, %o");
var OptionWasIgnored = new Warning("W07", "The %o option value was abandoned because the event listener wasn't added as duplicated.");
var InvalidEventListener = new Warning("W08", "The 'callback' argument must be a function or an object that has 'handleEvent' method: %o");
var InvalidAttributeHandler = new Warning("W09", "Event attribute handler must be a function: %o");
var Event = class {
  static get NONE() {
    return NONE;
  }
  static get CAPTURING_PHASE() {
    return CAPTURING_PHASE;
  }
  static get AT_TARGET() {
    return AT_TARGET;
  }
  static get BUBBLING_PHASE() {
    return BUBBLING_PHASE;
  }
  constructor(type, eventInitDict) {
    Object.defineProperty(this, "isTrusted", {
      value: false,
      enumerable: true
    });
    const opts = eventInitDict !== null && eventInitDict !== void 0 ? eventInitDict : {};
    internalDataMap.set(this, {
      type: String(type),
      bubbles: Boolean(opts.bubbles),
      cancelable: Boolean(opts.cancelable),
      composed: Boolean(opts.composed),
      target: null,
      currentTarget: null,
      stopPropagationFlag: false,
      stopImmediatePropagationFlag: false,
      canceledFlag: false,
      inPassiveListenerFlag: false,
      dispatchFlag: false,
      timeStamp: Date.now()
    });
  }
  get type() {
    return $(this).type;
  }
  get target() {
    return $(this).target;
  }
  get srcElement() {
    return $(this).target;
  }
  get currentTarget() {
    return $(this).currentTarget;
  }
  composedPath() {
    const currentTarget = $(this).currentTarget;
    if (currentTarget) {
      return [currentTarget];
    }
    return [];
  }
  get NONE() {
    return NONE;
  }
  get CAPTURING_PHASE() {
    return CAPTURING_PHASE;
  }
  get AT_TARGET() {
    return AT_TARGET;
  }
  get BUBBLING_PHASE() {
    return BUBBLING_PHASE;
  }
  get eventPhase() {
    return $(this).dispatchFlag ? 2 : 0;
  }
  stopPropagation() {
    $(this).stopPropagationFlag = true;
  }
  get cancelBubble() {
    return $(this).stopPropagationFlag;
  }
  set cancelBubble(value) {
    if (value) {
      $(this).stopPropagationFlag = true;
    } else {
      FalsyWasAssignedToCancelBubble.warn();
    }
  }
  stopImmediatePropagation() {
    const data = $(this);
    data.stopPropagationFlag = data.stopImmediatePropagationFlag = true;
  }
  get bubbles() {
    return $(this).bubbles;
  }
  get cancelable() {
    return $(this).cancelable;
  }
  get returnValue() {
    return !$(this).canceledFlag;
  }
  set returnValue(value) {
    if (!value) {
      setCancelFlag($(this));
    } else {
      TruthyWasAssignedToReturnValue.warn();
    }
  }
  preventDefault() {
    setCancelFlag($(this));
  }
  get defaultPrevented() {
    return $(this).canceledFlag;
  }
  get composed() {
    return $(this).composed;
  }
  get isTrusted() {
    return false;
  }
  get timeStamp() {
    return $(this).timeStamp;
  }
  initEvent(type, bubbles = false, cancelable = false) {
    const data = $(this);
    if (data.dispatchFlag) {
      InitEventWasCalledWhileDispatching.warn();
      return;
    }
    internalDataMap.set(this, {
      ...data,
      type: String(type),
      bubbles: Boolean(bubbles),
      cancelable: Boolean(cancelable),
      target: null,
      currentTarget: null,
      stopPropagationFlag: false,
      stopImmediatePropagationFlag: false,
      canceledFlag: false
    });
  }
};
__name(Event, "Event");
var NONE = 0;
var CAPTURING_PHASE = 1;
var AT_TARGET = 2;
var BUBBLING_PHASE = 3;
var internalDataMap = /* @__PURE__ */ new WeakMap();
function $(event, name = "this") {
  const retv = internalDataMap.get(event);
  assertType(retv != null, "'%s' must be an object that Event constructor created, but got another one: %o", name, event);
  return retv;
}
__name($, "$");
function setCancelFlag(data) {
  if (data.inPassiveListenerFlag) {
    CanceledInPassiveListener.warn();
    return;
  }
  if (!data.cancelable) {
    NonCancelableEventWasCanceled.warn();
    return;
  }
  data.canceledFlag = true;
}
__name(setCancelFlag, "setCancelFlag");
Object.defineProperty(Event, "NONE", { enumerable: true });
Object.defineProperty(Event, "CAPTURING_PHASE", { enumerable: true });
Object.defineProperty(Event, "AT_TARGET", { enumerable: true });
Object.defineProperty(Event, "BUBBLING_PHASE", { enumerable: true });
var keys = Object.getOwnPropertyNames(Event.prototype);
for (let i = 0; i < keys.length; ++i) {
  if (keys[i] === "constructor") {
    continue;
  }
  Object.defineProperty(Event.prototype, keys[i], { enumerable: true });
}
if (typeof Global !== "undefined" && typeof Global.Event !== "undefined") {
  Object.setPrototypeOf(Event.prototype, Global.Event.prototype);
}
function createInvalidStateError(message) {
  if (Global.DOMException) {
    return new Global.DOMException(message, "InvalidStateError");
  }
  if (DOMException == null) {
    DOMException = /* @__PURE__ */ __name(class DOMException2 extends Error {
      constructor(msg) {
        super(msg);
        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, DOMException2);
        }
      }
      get code() {
        return 11;
      }
      get name() {
        return "InvalidStateError";
      }
    }, "DOMException");
    Object.defineProperties(DOMException.prototype, {
      code: { enumerable: true },
      name: { enumerable: true }
    });
    defineErrorCodeProperties(DOMException);
    defineErrorCodeProperties(DOMException.prototype);
  }
  return new DOMException(message);
}
__name(createInvalidStateError, "createInvalidStateError");
var DOMException;
var ErrorCodeMap = {
  INDEX_SIZE_ERR: 1,
  DOMSTRING_SIZE_ERR: 2,
  HIERARCHY_REQUEST_ERR: 3,
  WRONG_DOCUMENT_ERR: 4,
  INVALID_CHARACTER_ERR: 5,
  NO_DATA_ALLOWED_ERR: 6,
  NO_MODIFICATION_ALLOWED_ERR: 7,
  NOT_FOUND_ERR: 8,
  NOT_SUPPORTED_ERR: 9,
  INUSE_ATTRIBUTE_ERR: 10,
  INVALID_STATE_ERR: 11,
  SYNTAX_ERR: 12,
  INVALID_MODIFICATION_ERR: 13,
  NAMESPACE_ERR: 14,
  INVALID_ACCESS_ERR: 15,
  VALIDATION_ERR: 16,
  TYPE_MISMATCH_ERR: 17,
  SECURITY_ERR: 18,
  NETWORK_ERR: 19,
  ABORT_ERR: 20,
  URL_MISMATCH_ERR: 21,
  QUOTA_EXCEEDED_ERR: 22,
  TIMEOUT_ERR: 23,
  INVALID_NODE_TYPE_ERR: 24,
  DATA_CLONE_ERR: 25
};
function defineErrorCodeProperties(obj) {
  const keys2 = Object.keys(ErrorCodeMap);
  for (let i = 0; i < keys2.length; ++i) {
    const key = keys2[i];
    const value = ErrorCodeMap[key];
    Object.defineProperty(obj, key, {
      get() {
        return value;
      },
      configurable: true,
      enumerable: true
    });
  }
}
__name(defineErrorCodeProperties, "defineErrorCodeProperties");
var EventWrapper = class extends Event {
  static wrap(event) {
    return new (getWrapperClassOf(event))(event);
  }
  constructor(event) {
    super(event.type, {
      bubbles: event.bubbles,
      cancelable: event.cancelable,
      composed: event.composed
    });
    if (event.cancelBubble) {
      super.stopPropagation();
    }
    if (event.defaultPrevented) {
      super.preventDefault();
    }
    internalDataMap$1.set(this, { original: event });
    const keys2 = Object.keys(event);
    for (let i = 0; i < keys2.length; ++i) {
      const key = keys2[i];
      if (!(key in this)) {
        Object.defineProperty(this, key, defineRedirectDescriptor(event, key));
      }
    }
  }
  stopPropagation() {
    super.stopPropagation();
    const { original } = $$1(this);
    if ("stopPropagation" in original) {
      original.stopPropagation();
    }
  }
  get cancelBubble() {
    return super.cancelBubble;
  }
  set cancelBubble(value) {
    super.cancelBubble = value;
    const { original } = $$1(this);
    if ("cancelBubble" in original) {
      original.cancelBubble = value;
    }
  }
  stopImmediatePropagation() {
    super.stopImmediatePropagation();
    const { original } = $$1(this);
    if ("stopImmediatePropagation" in original) {
      original.stopImmediatePropagation();
    }
  }
  get returnValue() {
    return super.returnValue;
  }
  set returnValue(value) {
    super.returnValue = value;
    const { original } = $$1(this);
    if ("returnValue" in original) {
      original.returnValue = value;
    }
  }
  preventDefault() {
    super.preventDefault();
    const { original } = $$1(this);
    if ("preventDefault" in original) {
      original.preventDefault();
    }
  }
  get timeStamp() {
    const { original } = $$1(this);
    if ("timeStamp" in original) {
      return original.timeStamp;
    }
    return super.timeStamp;
  }
};
__name(EventWrapper, "EventWrapper");
var internalDataMap$1 = /* @__PURE__ */ new WeakMap();
function $$1(event) {
  const retv = internalDataMap$1.get(event);
  assertType(retv != null, "'this' is expected an Event object, but got", event);
  return retv;
}
__name($$1, "$$1");
var wrapperClassCache = /* @__PURE__ */ new WeakMap();
wrapperClassCache.set(Object.prototype, EventWrapper);
if (typeof Global !== "undefined" && typeof Global.Event !== "undefined") {
  wrapperClassCache.set(Global.Event.prototype, EventWrapper);
}
function getWrapperClassOf(originalEvent) {
  const prototype = Object.getPrototypeOf(originalEvent);
  if (prototype == null) {
    return EventWrapper;
  }
  let wrapper = wrapperClassCache.get(prototype);
  if (wrapper == null) {
    wrapper = defineWrapper(getWrapperClassOf(prototype), prototype);
    wrapperClassCache.set(prototype, wrapper);
  }
  return wrapper;
}
__name(getWrapperClassOf, "getWrapperClassOf");
function defineWrapper(BaseEventWrapper, originalPrototype) {
  class CustomEventWrapper extends BaseEventWrapper {
  }
  __name(CustomEventWrapper, "CustomEventWrapper");
  const keys2 = Object.keys(originalPrototype);
  for (let i = 0; i < keys2.length; ++i) {
    Object.defineProperty(CustomEventWrapper.prototype, keys2[i], defineRedirectDescriptor(originalPrototype, keys2[i]));
  }
  return CustomEventWrapper;
}
__name(defineWrapper, "defineWrapper");
function defineRedirectDescriptor(obj, key) {
  const d = Object.getOwnPropertyDescriptor(obj, key);
  return {
    get() {
      const original = $$1(this).original;
      const value = original[key];
      if (typeof value === "function") {
        return value.bind(original);
      }
      return value;
    },
    set(value) {
      const original = $$1(this).original;
      original[key] = value;
    },
    configurable: d.configurable,
    enumerable: d.enumerable
  };
}
__name(defineRedirectDescriptor, "defineRedirectDescriptor");
function createListener(callback, capture, passive, once, signal, signalListener) {
  return {
    callback,
    flags: (capture ? 1 : 0) | (passive ? 2 : 0) | (once ? 4 : 0),
    signal,
    signalListener
  };
}
__name(createListener, "createListener");
function setRemoved(listener) {
  listener.flags |= 8;
}
__name(setRemoved, "setRemoved");
function isCapture(listener) {
  return (listener.flags & 1) === 1;
}
__name(isCapture, "isCapture");
function isPassive(listener) {
  return (listener.flags & 2) === 2;
}
__name(isPassive, "isPassive");
function isOnce(listener) {
  return (listener.flags & 4) === 4;
}
__name(isOnce, "isOnce");
function isRemoved(listener) {
  return (listener.flags & 8) === 8;
}
__name(isRemoved, "isRemoved");
function invokeCallback({ callback }, target, event) {
  try {
    if (typeof callback === "function") {
      callback.call(target, event);
    } else if (typeof callback.handleEvent === "function") {
      callback.handleEvent(event);
    }
  } catch (thrownError) {
    reportError(thrownError);
  }
}
__name(invokeCallback, "invokeCallback");
function findIndexOfListener({ listeners }, callback, capture) {
  for (let i = 0; i < listeners.length; ++i) {
    if (listeners[i].callback === callback && isCapture(listeners[i]) === capture) {
      return i;
    }
  }
  return -1;
}
__name(findIndexOfListener, "findIndexOfListener");
function addListener(list, callback, capture, passive, once, signal) {
  let signalListener;
  if (signal) {
    signalListener = removeListener.bind(null, list, callback, capture);
    signal.addEventListener("abort", signalListener);
  }
  const listener = createListener(callback, capture, passive, once, signal, signalListener);
  if (list.cow) {
    list.cow = false;
    list.listeners = [...list.listeners, listener];
  } else {
    list.listeners.push(listener);
  }
  return listener;
}
__name(addListener, "addListener");
function removeListener(list, callback, capture) {
  const index = findIndexOfListener(list, callback, capture);
  if (index !== -1) {
    return removeListenerAt(list, index);
  }
  return false;
}
__name(removeListener, "removeListener");
function removeListenerAt(list, index, disableCow = false) {
  const listener = list.listeners[index];
  setRemoved(listener);
  if (listener.signal) {
    listener.signal.removeEventListener("abort", listener.signalListener);
  }
  if (list.cow && !disableCow) {
    list.cow = false;
    list.listeners = list.listeners.filter((_, i) => i !== index);
    return false;
  }
  list.listeners.splice(index, 1);
  return true;
}
__name(removeListenerAt, "removeListenerAt");
function createListenerListMap() {
  return /* @__PURE__ */ Object.create(null);
}
__name(createListenerListMap, "createListenerListMap");
function ensureListenerList(listenerMap, type) {
  var _a;
  return (_a = listenerMap[type]) !== null && _a !== void 0 ? _a : listenerMap[type] = {
    attrCallback: void 0,
    attrListener: void 0,
    cow: false,
    listeners: []
  };
}
__name(ensureListenerList, "ensureListenerList");
var EventTarget = class {
  constructor() {
    internalDataMap$2.set(this, createListenerListMap());
  }
  addEventListener(type0, callback0, options0) {
    const listenerMap = $$2(this);
    const { callback, capture, once, passive, signal, type } = normalizeAddOptions(type0, callback0, options0);
    if (callback == null || (signal === null || signal === void 0 ? void 0 : signal.aborted)) {
      return;
    }
    const list = ensureListenerList(listenerMap, type);
    const i = findIndexOfListener(list, callback, capture);
    if (i !== -1) {
      warnDuplicate(list.listeners[i], passive, once, signal);
      return;
    }
    addListener(list, callback, capture, passive, once, signal);
  }
  removeEventListener(type0, callback0, options0) {
    const listenerMap = $$2(this);
    const { callback, capture, type } = normalizeOptions(type0, callback0, options0);
    const list = listenerMap[type];
    if (callback != null && list) {
      removeListener(list, callback, capture);
    }
  }
  dispatchEvent(e) {
    const list = $$2(this)[String(e.type)];
    if (list == null) {
      return true;
    }
    const event = e instanceof Event ? e : EventWrapper.wrap(e);
    const eventData = $(event, "event");
    if (eventData.dispatchFlag) {
      throw createInvalidStateError("This event has been in dispatching.");
    }
    eventData.dispatchFlag = true;
    eventData.target = eventData.currentTarget = this;
    if (!eventData.stopPropagationFlag) {
      const { cow, listeners } = list;
      list.cow = true;
      for (let i = 0; i < listeners.length; ++i) {
        const listener = listeners[i];
        if (isRemoved(listener)) {
          continue;
        }
        if (isOnce(listener) && removeListenerAt(list, i, !cow)) {
          i -= 1;
        }
        eventData.inPassiveListenerFlag = isPassive(listener);
        invokeCallback(listener, this, event);
        eventData.inPassiveListenerFlag = false;
        if (eventData.stopImmediatePropagationFlag) {
          break;
        }
      }
      if (!cow) {
        list.cow = false;
      }
    }
    eventData.target = null;
    eventData.currentTarget = null;
    eventData.stopImmediatePropagationFlag = false;
    eventData.stopPropagationFlag = false;
    eventData.dispatchFlag = false;
    return !eventData.canceledFlag;
  }
};
__name(EventTarget, "EventTarget");
var internalDataMap$2 = /* @__PURE__ */ new WeakMap();
function $$2(target, name = "this") {
  const retv = internalDataMap$2.get(target);
  assertType(retv != null, "'%s' must be an object that EventTarget constructor created, but got another one: %o", name, target);
  return retv;
}
__name($$2, "$$2");
function normalizeAddOptions(type, callback, options) {
  var _a;
  assertCallback(callback);
  if (typeof options === "object" && options !== null) {
    return {
      type: String(type),
      callback: callback !== null && callback !== void 0 ? callback : void 0,
      capture: Boolean(options.capture),
      passive: Boolean(options.passive),
      once: Boolean(options.once),
      signal: (_a = options.signal) !== null && _a !== void 0 ? _a : void 0
    };
  }
  return {
    type: String(type),
    callback: callback !== null && callback !== void 0 ? callback : void 0,
    capture: Boolean(options),
    passive: false,
    once: false,
    signal: void 0
  };
}
__name(normalizeAddOptions, "normalizeAddOptions");
function normalizeOptions(type, callback, options) {
  assertCallback(callback);
  if (typeof options === "object" && options !== null) {
    return {
      type: String(type),
      callback: callback !== null && callback !== void 0 ? callback : void 0,
      capture: Boolean(options.capture)
    };
  }
  return {
    type: String(type),
    callback: callback !== null && callback !== void 0 ? callback : void 0,
    capture: Boolean(options)
  };
}
__name(normalizeOptions, "normalizeOptions");
function assertCallback(callback) {
  if (typeof callback === "function" || typeof callback === "object" && callback !== null && typeof callback.handleEvent === "function") {
    return;
  }
  if (callback == null || typeof callback === "object") {
    InvalidEventListener.warn(callback);
    return;
  }
  throw new TypeError(format(InvalidEventListener.message, [callback]));
}
__name(assertCallback, "assertCallback");
function warnDuplicate(listener, passive, once, signal) {
  EventListenerWasDuplicated.warn(isCapture(listener) ? "capture" : "bubble", listener.callback);
  if (isPassive(listener) !== passive) {
    OptionWasIgnored.warn("passive");
  }
  if (isOnce(listener) !== once) {
    OptionWasIgnored.warn("once");
  }
  if (listener.signal !== signal) {
    OptionWasIgnored.warn("signal");
  }
}
__name(warnDuplicate, "warnDuplicate");
var keys$1 = Object.getOwnPropertyNames(EventTarget.prototype);
for (let i = 0; i < keys$1.length; ++i) {
  if (keys$1[i] === "constructor") {
    continue;
  }
  Object.defineProperty(EventTarget.prototype, keys$1[i], { enumerable: true });
}
if (typeof Global !== "undefined" && typeof Global.EventTarget !== "undefined") {
  Object.setPrototypeOf(EventTarget.prototype, Global.EventTarget.prototype);
}

// src/primitives/events.js
var FetchEvent = class extends Event {
  constructor(request) {
    super("fetch");
    this.request = request;
    this.response = null;
    this.awaiting = /* @__PURE__ */ new Set();
  }
  respondWith(response) {
    this.response = response;
  }
  waitUntil(promise) {
    this.awaiting.add(promise);
    promise.finally(() => this.awaiting.delete(promise));
  }
};
__name(FetchEvent, "FetchEvent");
var PromiseRejectionEvent = class extends Event {
  constructor(type, init) {
    super(type, { cancelable: true });
    this.promise = init.promise;
    this.reason = init.reason;
  }
};
__name(PromiseRejectionEvent, "PromiseRejectionEvent");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Event,
  EventTarget,
  FetchEvent,
  PromiseRejectionEvent
});
