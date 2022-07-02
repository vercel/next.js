"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};

// src/constants.js
var require_constants = __commonJS({
  "src/constants.js"(exports, module2) {
    "use strict";
    module2.exports.ENUMERABLE_PROPERTIES = [
      "AbortController",
      "AbortSignal",
      "AggregateError",
      "Array",
      "ArrayBuffer",
      "atob",
      "Atomics",
      "BigInt",
      "BigInt64Array",
      "BigUint64Array",
      "Blob",
      "Boolean",
      "btoa",
      "Cache",
      "caches",
      "CacheStorage",
      "clearInterval",
      "clearTimeout",
      "console",
      "crypto",
      "Crypto",
      "CryptoKey",
      "DataView",
      "Date",
      "decodeURI",
      "decodeURIComponent",
      "encodeURI",
      "encodeURIComponent",
      "Error",
      "EvalError",
      "Event",
      "EventTarget",
      "fetch",
      "FetchEvent",
      "File",
      "Float32Array",
      "Float64Array",
      "FormData",
      "Function",
      "globalThis",
      "Headers",
      "Infinity",
      "Int8Array",
      "Int16Array",
      "Int32Array",
      "Intl",
      "isFinite",
      "isNaN",
      "JSON",
      "Map",
      "Math",
      "Number",
      "Object",
      "parseFloat",
      "parseInt",
      "Promise",
      "PromiseRejectionEvent",
      "Proxy",
      "RangeError",
      "ReadableStream",
      "ReadableStreamBYOBReader",
      "ReadableStreamDefaultReader",
      "ReferenceError",
      "Reflect",
      "RegExp",
      "Request",
      "Response",
      "self",
      "Set",
      "setInterval",
      "setTimeout",
      "SharedArrayBuffer",
      "String",
      "structuredClone",
      "SubtleCrypto",
      "Symbol",
      "SyntaxError",
      "TextDecoder",
      "TextEncoder",
      "TransformStream",
      "TypeError",
      "Uint8Array",
      "Uint8ClampedArray",
      "Uint16Array",
      "Uint32Array",
      "URIError",
      "URL",
      "URLPattern",
      "URLSearchParams",
      "WeakMap",
      "WeakSet",
      "WebAssembly",
      "WritableStream",
      "WritableStreamDefaultWriter"
    ];
    module2.exports.NON_ENUMERABLE_PROPERTIES = [];
  }
});

// src/utils.js
var require_utils = __commonJS({
  "src/utils.js"(exports, module2) {
    "use strict";
    var CONSTANTS = require_constants();
    function defineEnumerableProperty(obj, key, value) {
      if (!CONSTANTS.ENUMERABLE_PROPERTIES.includes(key)) {
        throw new Error(`Attempted to define '${key}' as unexistent enumerable property`);
      }
      return Object.defineProperty(obj, key, {
        configurable: false,
        enumerable: true,
        value,
        writable: true
      });
    }
    __name(defineEnumerableProperty, "defineEnumerableProperty");
    function defineNonEnumerableProperty(obj, key, value) {
      if (!CONSTANTS.NON_ENUMERABLE_PROPERTIES.includes(key)) {
        throw new Error(`Attempted to define '${key}' as unexistent non enumerable property`);
      }
      return Object.defineProperty(obj, key, {
        configurable: false,
        enumerable: false,
        value,
        writable: true
      });
    }
    __name(defineNonEnumerableProperty, "defineNonEnumerableProperty");
    function defineEnumerableProperties2(obj, map) {
      for (const [key, value] of Object.entries(map)) {
        defineEnumerableProperty(obj, key, value);
      }
    }
    __name(defineEnumerableProperties2, "defineEnumerableProperties");
    module2.exports = {
      defineEnumerableProperties: defineEnumerableProperties2,
      defineEnumerableProperty,
      defineNonEnumerableProperty
    };
  }
});

// ../../node_modules/.pnpm/event-target-shim@5.0.1/node_modules/event-target-shim/dist/event-target-shim.js
var require_event_target_shim = __commonJS({
  "../../node_modules/.pnpm/event-target-shim@5.0.1/node_modules/event-target-shim/dist/event-target-shim.js"(exports, module2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var privateData = /* @__PURE__ */ new WeakMap();
    var wrappers = /* @__PURE__ */ new WeakMap();
    function pd(event) {
      const retv = privateData.get(event);
      console.assert(retv != null, "'this' is expected an Event object, but got", event);
      return retv;
    }
    __name(pd, "pd");
    function setCancelFlag(data) {
      if (data.passiveListener != null) {
        if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error("Unable to preventDefault inside passive event listener invocation.", data.passiveListener);
        }
        return;
      }
      if (!data.event.cancelable) {
        return;
      }
      data.canceled = true;
      if (typeof data.event.preventDefault === "function") {
        data.event.preventDefault();
      }
    }
    __name(setCancelFlag, "setCancelFlag");
    function Event(eventTarget, event) {
      privateData.set(this, {
        eventTarget,
        event,
        eventPhase: 2,
        currentTarget: eventTarget,
        canceled: false,
        stopped: false,
        immediateStopped: false,
        passiveListener: null,
        timeStamp: event.timeStamp || Date.now()
      });
      Object.defineProperty(this, "isTrusted", { value: false, enumerable: true });
      const keys = Object.keys(event);
      for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        if (!(key in this)) {
          Object.defineProperty(this, key, defineRedirectDescriptor(key));
        }
      }
    }
    __name(Event, "Event");
    Event.prototype = {
      get type() {
        return pd(this).event.type;
      },
      get target() {
        return pd(this).eventTarget;
      },
      get currentTarget() {
        return pd(this).currentTarget;
      },
      composedPath() {
        const currentTarget = pd(this).currentTarget;
        if (currentTarget == null) {
          return [];
        }
        return [currentTarget];
      },
      get NONE() {
        return 0;
      },
      get CAPTURING_PHASE() {
        return 1;
      },
      get AT_TARGET() {
        return 2;
      },
      get BUBBLING_PHASE() {
        return 3;
      },
      get eventPhase() {
        return pd(this).eventPhase;
      },
      stopPropagation() {
        const data = pd(this);
        data.stopped = true;
        if (typeof data.event.stopPropagation === "function") {
          data.event.stopPropagation();
        }
      },
      stopImmediatePropagation() {
        const data = pd(this);
        data.stopped = true;
        data.immediateStopped = true;
        if (typeof data.event.stopImmediatePropagation === "function") {
          data.event.stopImmediatePropagation();
        }
      },
      get bubbles() {
        return Boolean(pd(this).event.bubbles);
      },
      get cancelable() {
        return Boolean(pd(this).event.cancelable);
      },
      preventDefault() {
        setCancelFlag(pd(this));
      },
      get defaultPrevented() {
        return pd(this).canceled;
      },
      get composed() {
        return Boolean(pd(this).event.composed);
      },
      get timeStamp() {
        return pd(this).timeStamp;
      },
      get srcElement() {
        return pd(this).eventTarget;
      },
      get cancelBubble() {
        return pd(this).stopped;
      },
      set cancelBubble(value) {
        if (!value) {
          return;
        }
        const data = pd(this);
        data.stopped = true;
        if (typeof data.event.cancelBubble === "boolean") {
          data.event.cancelBubble = true;
        }
      },
      get returnValue() {
        return !pd(this).canceled;
      },
      set returnValue(value) {
        if (!value) {
          setCancelFlag(pd(this));
        }
      },
      initEvent() {
      }
    };
    Object.defineProperty(Event.prototype, "constructor", {
      value: Event,
      configurable: true,
      writable: true
    });
    if (typeof window !== "undefined" && typeof window.Event !== "undefined") {
      Object.setPrototypeOf(Event.prototype, window.Event.prototype);
      wrappers.set(window.Event.prototype, Event);
    }
    function defineRedirectDescriptor(key) {
      return {
        get() {
          return pd(this).event[key];
        },
        set(value) {
          pd(this).event[key] = value;
        },
        configurable: true,
        enumerable: true
      };
    }
    __name(defineRedirectDescriptor, "defineRedirectDescriptor");
    function defineCallDescriptor(key) {
      return {
        value() {
          const event = pd(this).event;
          return event[key].apply(event, arguments);
        },
        configurable: true,
        enumerable: true
      };
    }
    __name(defineCallDescriptor, "defineCallDescriptor");
    function defineWrapper(BaseEvent, proto) {
      const keys = Object.keys(proto);
      if (keys.length === 0) {
        return BaseEvent;
      }
      function CustomEvent(eventTarget, event) {
        BaseEvent.call(this, eventTarget, event);
      }
      __name(CustomEvent, "CustomEvent");
      CustomEvent.prototype = Object.create(BaseEvent.prototype, {
        constructor: { value: CustomEvent, configurable: true, writable: true }
      });
      for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        if (!(key in BaseEvent.prototype)) {
          const descriptor = Object.getOwnPropertyDescriptor(proto, key);
          const isFunc = typeof descriptor.value === "function";
          Object.defineProperty(CustomEvent.prototype, key, isFunc ? defineCallDescriptor(key) : defineRedirectDescriptor(key));
        }
      }
      return CustomEvent;
    }
    __name(defineWrapper, "defineWrapper");
    function getWrapper(proto) {
      if (proto == null || proto === Object.prototype) {
        return Event;
      }
      let wrapper = wrappers.get(proto);
      if (wrapper == null) {
        wrapper = defineWrapper(getWrapper(Object.getPrototypeOf(proto)), proto);
        wrappers.set(proto, wrapper);
      }
      return wrapper;
    }
    __name(getWrapper, "getWrapper");
    function wrapEvent(eventTarget, event) {
      const Wrapper = getWrapper(Object.getPrototypeOf(event));
      return new Wrapper(eventTarget, event);
    }
    __name(wrapEvent, "wrapEvent");
    function isStopped(event) {
      return pd(event).immediateStopped;
    }
    __name(isStopped, "isStopped");
    function setEventPhase(event, eventPhase) {
      pd(event).eventPhase = eventPhase;
    }
    __name(setEventPhase, "setEventPhase");
    function setCurrentTarget(event, currentTarget) {
      pd(event).currentTarget = currentTarget;
    }
    __name(setCurrentTarget, "setCurrentTarget");
    function setPassiveListener(event, passiveListener) {
      pd(event).passiveListener = passiveListener;
    }
    __name(setPassiveListener, "setPassiveListener");
    var listenersMap = /* @__PURE__ */ new WeakMap();
    var CAPTURE = 1;
    var BUBBLE = 2;
    var ATTRIBUTE = 3;
    function isObject(x) {
      return x !== null && typeof x === "object";
    }
    __name(isObject, "isObject");
    function getListeners(eventTarget) {
      const listeners = listenersMap.get(eventTarget);
      if (listeners == null) {
        throw new TypeError("'this' is expected an EventTarget object, but got another value.");
      }
      return listeners;
    }
    __name(getListeners, "getListeners");
    function defineEventAttributeDescriptor(eventName) {
      return {
        get() {
          const listeners = getListeners(this);
          let node = listeners.get(eventName);
          while (node != null) {
            if (node.listenerType === ATTRIBUTE) {
              return node.listener;
            }
            node = node.next;
          }
          return null;
        },
        set(listener) {
          if (typeof listener !== "function" && !isObject(listener)) {
            listener = null;
          }
          const listeners = getListeners(this);
          let prev = null;
          let node = listeners.get(eventName);
          while (node != null) {
            if (node.listenerType === ATTRIBUTE) {
              if (prev !== null) {
                prev.next = node.next;
              } else if (node.next !== null) {
                listeners.set(eventName, node.next);
              } else {
                listeners.delete(eventName);
              }
            } else {
              prev = node;
            }
            node = node.next;
          }
          if (listener !== null) {
            const newNode = {
              listener,
              listenerType: ATTRIBUTE,
              passive: false,
              once: false,
              next: null
            };
            if (prev === null) {
              listeners.set(eventName, newNode);
            } else {
              prev.next = newNode;
            }
          }
        },
        configurable: true,
        enumerable: true
      };
    }
    __name(defineEventAttributeDescriptor, "defineEventAttributeDescriptor");
    function defineEventAttribute(eventTargetPrototype, eventName) {
      Object.defineProperty(eventTargetPrototype, `on${eventName}`, defineEventAttributeDescriptor(eventName));
    }
    __name(defineEventAttribute, "defineEventAttribute");
    function defineCustomEventTarget(eventNames) {
      function CustomEventTarget() {
        EventTarget.call(this);
      }
      __name(CustomEventTarget, "CustomEventTarget");
      CustomEventTarget.prototype = Object.create(EventTarget.prototype, {
        constructor: {
          value: CustomEventTarget,
          configurable: true,
          writable: true
        }
      });
      for (let i = 0; i < eventNames.length; ++i) {
        defineEventAttribute(CustomEventTarget.prototype, eventNames[i]);
      }
      return CustomEventTarget;
    }
    __name(defineCustomEventTarget, "defineCustomEventTarget");
    function EventTarget() {
      if (this instanceof EventTarget) {
        listenersMap.set(this, /* @__PURE__ */ new Map());
        return;
      }
      if (arguments.length === 1 && Array.isArray(arguments[0])) {
        return defineCustomEventTarget(arguments[0]);
      }
      if (arguments.length > 0) {
        const types = new Array(arguments.length);
        for (let i = 0; i < arguments.length; ++i) {
          types[i] = arguments[i];
        }
        return defineCustomEventTarget(types);
      }
      throw new TypeError("Cannot call a class as a function");
    }
    __name(EventTarget, "EventTarget");
    EventTarget.prototype = {
      addEventListener(eventName, listener, options) {
        if (listener == null) {
          return;
        }
        if (typeof listener !== "function" && !isObject(listener)) {
          throw new TypeError("'listener' should be a function or an object.");
        }
        const listeners = getListeners(this);
        const optionsIsObj = isObject(options);
        const capture = optionsIsObj ? Boolean(options.capture) : Boolean(options);
        const listenerType = capture ? CAPTURE : BUBBLE;
        const newNode = {
          listener,
          listenerType,
          passive: optionsIsObj && Boolean(options.passive),
          once: optionsIsObj && Boolean(options.once),
          next: null
        };
        let node = listeners.get(eventName);
        if (node === void 0) {
          listeners.set(eventName, newNode);
          return;
        }
        let prev = null;
        while (node != null) {
          if (node.listener === listener && node.listenerType === listenerType) {
            return;
          }
          prev = node;
          node = node.next;
        }
        prev.next = newNode;
      },
      removeEventListener(eventName, listener, options) {
        if (listener == null) {
          return;
        }
        const listeners = getListeners(this);
        const capture = isObject(options) ? Boolean(options.capture) : Boolean(options);
        const listenerType = capture ? CAPTURE : BUBBLE;
        let prev = null;
        let node = listeners.get(eventName);
        while (node != null) {
          if (node.listener === listener && node.listenerType === listenerType) {
            if (prev !== null) {
              prev.next = node.next;
            } else if (node.next !== null) {
              listeners.set(eventName, node.next);
            } else {
              listeners.delete(eventName);
            }
            return;
          }
          prev = node;
          node = node.next;
        }
      },
      dispatchEvent(event) {
        if (event == null || typeof event.type !== "string") {
          throw new TypeError('"event.type" should be a string.');
        }
        const listeners = getListeners(this);
        const eventName = event.type;
        let node = listeners.get(eventName);
        if (node == null) {
          return true;
        }
        const wrappedEvent = wrapEvent(this, event);
        let prev = null;
        while (node != null) {
          if (node.once) {
            if (prev !== null) {
              prev.next = node.next;
            } else if (node.next !== null) {
              listeners.set(eventName, node.next);
            } else {
              listeners.delete(eventName);
            }
          } else {
            prev = node;
          }
          setPassiveListener(wrappedEvent, node.passive ? node.listener : null);
          if (typeof node.listener === "function") {
            try {
              node.listener.call(this, wrappedEvent);
            } catch (err) {
              if (typeof console !== "undefined" && typeof console.error === "function") {
                console.error(err);
              }
            }
          } else if (node.listenerType !== ATTRIBUTE && typeof node.listener.handleEvent === "function") {
            node.listener.handleEvent(wrappedEvent);
          }
          if (isStopped(wrappedEvent)) {
            break;
          }
          node = node.next;
        }
        setPassiveListener(wrappedEvent, null);
        setEventPhase(wrappedEvent, 0);
        setCurrentTarget(wrappedEvent, null);
        return !wrappedEvent.defaultPrevented;
      }
    };
    Object.defineProperty(EventTarget.prototype, "constructor", {
      value: EventTarget,
      configurable: true,
      writable: true
    });
    if (typeof window !== "undefined" && typeof window.EventTarget !== "undefined") {
      Object.setPrototypeOf(EventTarget.prototype, window.EventTarget.prototype);
    }
    exports.defineEventAttribute = defineEventAttribute;
    exports.EventTarget = EventTarget;
    exports.default = EventTarget;
    module2.exports = EventTarget;
    module2.exports.EventTarget = module2.exports["default"] = EventTarget;
    module2.exports.defineEventAttribute = defineEventAttribute;
  }
});

// ../../node_modules/.pnpm/abort-controller@3.0.0/node_modules/abort-controller/dist/abort-controller.js
var require_abort_controller = __commonJS({
  "../../node_modules/.pnpm/abort-controller@3.0.0/node_modules/abort-controller/dist/abort-controller.js"(exports, module2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var eventTargetShim = require_event_target_shim();
    var AbortSignal = class extends eventTargetShim.EventTarget {
      constructor() {
        super();
        throw new TypeError("AbortSignal cannot be constructed directly");
      }
      get aborted() {
        const aborted = abortedFlags.get(this);
        if (typeof aborted !== "boolean") {
          throw new TypeError(`Expected 'this' to be an 'AbortSignal' object, but got ${this === null ? "null" : typeof this}`);
        }
        return aborted;
      }
    };
    __name(AbortSignal, "AbortSignal");
    eventTargetShim.defineEventAttribute(AbortSignal.prototype, "abort");
    function createAbortSignal() {
      const signal = Object.create(AbortSignal.prototype);
      eventTargetShim.EventTarget.call(signal);
      abortedFlags.set(signal, false);
      return signal;
    }
    __name(createAbortSignal, "createAbortSignal");
    function abortSignal(signal) {
      if (abortedFlags.get(signal) !== false) {
        return;
      }
      abortedFlags.set(signal, true);
      signal.dispatchEvent({ type: "abort" });
    }
    __name(abortSignal, "abortSignal");
    var abortedFlags = /* @__PURE__ */ new WeakMap();
    Object.defineProperties(AbortSignal.prototype, {
      aborted: { enumerable: true }
    });
    if (typeof Symbol === "function" && typeof Symbol.toStringTag === "symbol") {
      Object.defineProperty(AbortSignal.prototype, Symbol.toStringTag, {
        configurable: true,
        value: "AbortSignal"
      });
    }
    var AbortController2 = class {
      constructor() {
        signals.set(this, createAbortSignal());
      }
      get signal() {
        return getSignal(this);
      }
      abort() {
        abortSignal(getSignal(this));
      }
    };
    __name(AbortController2, "AbortController");
    var signals = /* @__PURE__ */ new WeakMap();
    function getSignal(controller) {
      const signal = signals.get(controller);
      if (signal == null) {
        throw new TypeError(`Expected 'this' to be an 'AbortController' object, but got ${controller === null ? "null" : typeof controller}`);
      }
      return signal;
    }
    __name(getSignal, "getSignal");
    Object.defineProperties(AbortController2.prototype, {
      signal: { enumerable: true },
      abort: { enumerable: true }
    });
    if (typeof Symbol === "function" && typeof Symbol.toStringTag === "symbol") {
      Object.defineProperty(AbortController2.prototype, Symbol.toStringTag, {
        configurable: true,
        value: "AbortController"
      });
    }
    exports.AbortController = AbortController2;
    exports.AbortSignal = AbortSignal;
    exports.default = AbortController2;
    module2.exports = AbortController2;
    module2.exports.AbortController = module2.exports["default"] = AbortController2;
    module2.exports.AbortSignal = AbortSignal;
  }
});

// ../../node_modules/.pnpm/aggregate-error-ponyfill@1.1.0/node_modules/aggregate-error-ponyfill/cjs/index.js
var require_cjs = __commonJS({
  "../../node_modules/.pnpm/aggregate-error-ponyfill@1.1.0/node_modules/aggregate-error-ponyfill/cjs/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function _inheritsLoose(subClass, superClass) {
      subClass.prototype = Object.create(superClass.prototype);
      subClass.prototype.constructor = subClass;
      subClass.__proto__ = superClass;
    }
    __name(_inheritsLoose, "_inheritsLoose");
    function _getPrototypeOf(o) {
      _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : /* @__PURE__ */ __name(function _getPrototypeOf2(o2) {
        return o2.__proto__ || Object.getPrototypeOf(o2);
      }, "_getPrototypeOf");
      return _getPrototypeOf(o);
    }
    __name(_getPrototypeOf, "_getPrototypeOf");
    function _setPrototypeOf(o, p) {
      _setPrototypeOf = Object.setPrototypeOf || /* @__PURE__ */ __name(function _setPrototypeOf2(o2, p2) {
        o2.__proto__ = p2;
        return o2;
      }, "_setPrototypeOf");
      return _setPrototypeOf(o, p);
    }
    __name(_setPrototypeOf, "_setPrototypeOf");
    function _isNativeReflectConstruct() {
      if (typeof Reflect === "undefined" || !Reflect.construct)
        return false;
      if (Reflect.construct.sham)
        return false;
      if (typeof Proxy === "function")
        return true;
      try {
        Date.prototype.toString.call(Reflect.construct(Date, [], function() {
        }));
        return true;
      } catch (e) {
        return false;
      }
    }
    __name(_isNativeReflectConstruct, "_isNativeReflectConstruct");
    function _construct(Parent, args, Class) {
      if (_isNativeReflectConstruct()) {
        _construct = Reflect.construct;
      } else {
        _construct = /* @__PURE__ */ __name(function _construct2(Parent2, args2, Class2) {
          var a = [null];
          a.push.apply(a, args2);
          var Constructor = Function.bind.apply(Parent2, a);
          var instance = new Constructor();
          if (Class2)
            _setPrototypeOf(instance, Class2.prototype);
          return instance;
        }, "_construct");
      }
      return _construct.apply(null, arguments);
    }
    __name(_construct, "_construct");
    function _isNativeFunction(fn) {
      return Function.toString.call(fn).indexOf("[native code]") !== -1;
    }
    __name(_isNativeFunction, "_isNativeFunction");
    function _wrapNativeSuper(Class) {
      var _cache = typeof Map === "function" ? /* @__PURE__ */ new Map() : void 0;
      _wrapNativeSuper = /* @__PURE__ */ __name(function _wrapNativeSuper2(Class2) {
        if (Class2 === null || !_isNativeFunction(Class2))
          return Class2;
        if (typeof Class2 !== "function") {
          throw new TypeError("Super expression must either be null or a function");
        }
        if (typeof _cache !== "undefined") {
          if (_cache.has(Class2))
            return _cache.get(Class2);
          _cache.set(Class2, Wrapper);
        }
        function Wrapper() {
          return _construct(Class2, arguments, _getPrototypeOf(this).constructor);
        }
        __name(Wrapper, "Wrapper");
        Wrapper.prototype = Object.create(Class2.prototype, {
          constructor: {
            value: Wrapper,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
        return _setPrototypeOf(Wrapper, Class2);
      }, "_wrapNativeSuper");
      return _wrapNativeSuper(Class);
    }
    __name(_wrapNativeSuper, "_wrapNativeSuper");
    function _assertThisInitialized(self2) {
      if (self2 === void 0) {
        throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
      }
      return self2;
    }
    __name(_assertThisInitialized, "_assertThisInitialized");
    var isIterable = /* @__PURE__ */ __name(function(val) {
      return typeof Symbol !== "undefined" && Symbol && "iterator" in Symbol && val != null && typeof val[Symbol.iterator] === "function";
    }, "isIterable");
    var _globalThis$Aggregate;
    var _globalThis = function(Object2) {
      function get() {
        var _global2 = this || self;
        delete Object2.prototype.__magic__;
        return _global2;
      }
      __name(get, "get");
      if (typeof globalThis === "object") {
        return globalThis;
      }
      if (this) {
        return get();
      } else {
        Object2.defineProperty(Object2.prototype, "__magic__", {
          configurable: true,
          get
        });
        var _global = __magic__;
        return _global;
      }
    }(Object);
    var AggregateError = /* @__PURE__ */ function(_Error) {
      _inheritsLoose(AggregateError2, _Error);
      function AggregateError2(errors, message) {
        var _this;
        if (message === void 0) {
          message = "";
        }
        _this = _Error.call(this, message) || this;
        _this.name = _this.constructor.name;
        _this.message = message;
        if (typeof Error.captureStackTrace === "function") {
          Error.captureStackTrace(_assertThisInitialized(_this), _this.constructor);
        } else {
          _this.stack = new Error(message).stack;
        }
        if (!Array.isArray(errors) && !isIterable(errors)) {
          throw new TypeError(errors + " is not an iterable");
        }
        _this.errors = [].concat(errors);
        return _this;
      }
      __name(AggregateError2, "AggregateError");
      return AggregateError2;
    }(/* @__PURE__ */ _wrapNativeSuper(Error));
    var preferNative = (_globalThis$Aggregate = _globalThis.AggregateError) != null ? _globalThis$Aggregate : AggregateError;
    exports.default = AggregateError;
    exports.preferNative = preferNative;
  }
});

// src/polyfills/base64.js
var require_base64 = __commonJS({
  "src/polyfills/base64.js"(exports, module2) {
    "use strict";
    module2.exports.atob = (enc) => Buffer.from(enc, "base64").toString("binary");
    module2.exports.btoa = (str) => Buffer.from(str, "binary").toString("base64");
  }
});

// ../../node_modules/.pnpm/web-streams-polyfill@4.0.0-beta.1/node_modules/web-streams-polyfill/dist/ponyfill.js
var require_ponyfill = __commonJS({
  "../../node_modules/.pnpm/web-streams-polyfill@4.0.0-beta.1/node_modules/web-streams-polyfill/dist/ponyfill.js"(exports, module2) {
    !function(e, t) {
      typeof exports == "object" && typeof module2 != "undefined" ? t(exports) : typeof define == "function" && define.amd ? define(["exports"], t) : t((e = typeof globalThis != "undefined" ? globalThis : e || self).WebStreamsPolyfill = {});
    }(exports, function(e) {
      "use strict";
      const t = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? Symbol : (e2) => `Symbol(${e2})`;
      function r() {
      }
      __name(r, "r");
      function o(e2) {
        return typeof e2 == "object" && e2 !== null || typeof e2 == "function";
      }
      __name(o, "o");
      const n = r, a = Promise, i = Promise.prototype.then, l = Promise.resolve.bind(a), s = Promise.reject.bind(a);
      function u(e2) {
        return new a(e2);
      }
      __name(u, "u");
      function c(e2) {
        return l(e2);
      }
      __name(c, "c");
      function d(e2) {
        return s(e2);
      }
      __name(d, "d");
      function f(e2, t2, r2) {
        return i.call(e2, t2, r2);
      }
      __name(f, "f");
      function b(e2, t2, r2) {
        f(f(e2, t2, r2), void 0, n);
      }
      __name(b, "b");
      function _(e2, t2) {
        b(e2, t2);
      }
      __name(_, "_");
      function h(e2, t2) {
        b(e2, void 0, t2);
      }
      __name(h, "h");
      function m(e2, t2, r2) {
        return f(e2, t2, r2);
      }
      __name(m, "m");
      function p(e2) {
        f(e2, void 0, n);
      }
      __name(p, "p");
      let y = /* @__PURE__ */ __name((e2) => {
        if (typeof queueMicrotask == "function")
          y = queueMicrotask;
        else {
          const e3 = c(void 0);
          y = /* @__PURE__ */ __name((t2) => f(e3, t2), "y");
        }
        return y(e2);
      }, "y");
      function g(e2, t2, r2) {
        if (typeof e2 != "function")
          throw new TypeError("Argument is not a function");
        return Function.prototype.apply.call(e2, t2, r2);
      }
      __name(g, "g");
      function S(e2, t2, r2) {
        try {
          return c(g(e2, t2, r2));
        } catch (e3) {
          return d(e3);
        }
      }
      __name(S, "S");
      class v {
        constructor() {
          this._cursor = 0, this._size = 0, this._front = { _elements: [], _next: void 0 }, this._back = this._front, this._cursor = 0, this._size = 0;
        }
        get length() {
          return this._size;
        }
        push(e2) {
          const t2 = this._back;
          let r2 = t2;
          t2._elements.length === 16383 && (r2 = { _elements: [], _next: void 0 }), t2._elements.push(e2), r2 !== t2 && (this._back = r2, t2._next = r2), ++this._size;
        }
        shift() {
          const e2 = this._front;
          let t2 = e2;
          const r2 = this._cursor;
          let o2 = r2 + 1;
          const n2 = e2._elements, a2 = n2[r2];
          return o2 === 16384 && (t2 = e2._next, o2 = 0), --this._size, this._cursor = o2, e2 !== t2 && (this._front = t2), n2[r2] = void 0, a2;
        }
        forEach(e2) {
          let t2 = this._cursor, r2 = this._front, o2 = r2._elements;
          for (; !(t2 === o2.length && r2._next === void 0 || t2 === o2.length && (r2 = r2._next, o2 = r2._elements, t2 = 0, o2.length === 0)); )
            e2(o2[t2]), ++t2;
        }
        peek() {
          const e2 = this._front, t2 = this._cursor;
          return e2._elements[t2];
        }
      }
      __name(v, "v");
      function w(e2, t2) {
        e2._ownerReadableStream = t2, t2._reader = e2, t2._state === "readable" ? q(e2) : t2._state === "closed" ? function(e3) {
          q(e3), W(e3);
        }(e2) : P(e2, t2._storedError);
      }
      __name(w, "w");
      function R(e2, t2) {
        return dr(e2._ownerReadableStream, t2);
      }
      __name(R, "R");
      function T(e2) {
        e2._ownerReadableStream._state === "readable" ? E(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")) : function(e3, t2) {
          P(e3, t2);
        }(e2, new TypeError("Reader was released and can no longer be used to monitor the stream's closedness")), e2._ownerReadableStream._reader = void 0, e2._ownerReadableStream = void 0;
      }
      __name(T, "T");
      function C(e2) {
        return new TypeError("Cannot " + e2 + " a stream using a released reader");
      }
      __name(C, "C");
      function q(e2) {
        e2._closedPromise = u((t2, r2) => {
          e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2;
        });
      }
      __name(q, "q");
      function P(e2, t2) {
        q(e2), E(e2, t2);
      }
      __name(P, "P");
      function E(e2, t2) {
        e2._closedPromise_reject !== void 0 && (p(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
      }
      __name(E, "E");
      function W(e2) {
        e2._closedPromise_resolve !== void 0 && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0);
      }
      __name(W, "W");
      const O = t("[[AbortSteps]]"), B = t("[[ErrorSteps]]"), k = t("[[CancelSteps]]"), j = t("[[PullSteps]]"), A = Number.isFinite || function(e2) {
        return typeof e2 == "number" && isFinite(e2);
      }, z = Math.trunc || function(e2) {
        return e2 < 0 ? Math.ceil(e2) : Math.floor(e2);
      };
      function F(e2, t2) {
        if (e2 !== void 0 && (typeof (r2 = e2) != "object" && typeof r2 != "function"))
          throw new TypeError(`${t2} is not an object.`);
        var r2;
      }
      __name(F, "F");
      function I(e2, t2) {
        if (typeof e2 != "function")
          throw new TypeError(`${t2} is not a function.`);
      }
      __name(I, "I");
      function L(e2, t2) {
        if (!function(e3) {
          return typeof e3 == "object" && e3 !== null || typeof e3 == "function";
        }(e2))
          throw new TypeError(`${t2} is not an object.`);
      }
      __name(L, "L");
      function D(e2, t2, r2) {
        if (e2 === void 0)
          throw new TypeError(`Parameter ${t2} is required in '${r2}'.`);
      }
      __name(D, "D");
      function $(e2, t2, r2) {
        if (e2 === void 0)
          throw new TypeError(`${t2} is required in '${r2}'.`);
      }
      __name($, "$");
      function M(e2) {
        return Number(e2);
      }
      __name(M, "M");
      function Q(e2) {
        return e2 === 0 ? 0 : e2;
      }
      __name(Q, "Q");
      function Y(e2, t2) {
        const r2 = Number.MAX_SAFE_INTEGER;
        let o2 = Number(e2);
        if (o2 = Q(o2), !A(o2))
          throw new TypeError(`${t2} is not a finite number`);
        if (o2 = function(e3) {
          return Q(z(e3));
        }(o2), o2 < 0 || o2 > r2)
          throw new TypeError(`${t2} is outside the accepted range of 0 to ${r2}, inclusive`);
        return A(o2) && o2 !== 0 ? o2 : 0;
      }
      __name(Y, "Y");
      function x(e2, t2) {
        if (!ur(e2))
          throw new TypeError(`${t2} is not a ReadableStream.`);
      }
      __name(x, "x");
      function N(e2) {
        return new ReadableStreamDefaultReader(e2);
      }
      __name(N, "N");
      function H(e2, t2) {
        e2._reader._readRequests.push(t2);
      }
      __name(H, "H");
      function V(e2, t2, r2) {
        const o2 = e2._reader._readRequests.shift();
        r2 ? o2._closeSteps() : o2._chunkSteps(t2);
      }
      __name(V, "V");
      function U(e2) {
        return e2._reader._readRequests.length;
      }
      __name(U, "U");
      function G(e2) {
        const t2 = e2._reader;
        return t2 !== void 0 && !!X(t2);
      }
      __name(G, "G");
      class ReadableStreamDefaultReader {
        constructor(e2) {
          if (D(e2, 1, "ReadableStreamDefaultReader"), x(e2, "First parameter"), cr(e2))
            throw new TypeError("This stream has already been locked for exclusive reading by another reader");
          w(this, e2), this._readRequests = new v();
        }
        get closed() {
          return X(this) ? this._closedPromise : d(K("closed"));
        }
        cancel(e2) {
          return X(this) ? this._ownerReadableStream === void 0 ? d(C("cancel")) : R(this, e2) : d(K("cancel"));
        }
        read() {
          if (!X(this))
            return d(K("read"));
          if (this._ownerReadableStream === void 0)
            return d(C("read from"));
          let e2, t2;
          const r2 = u((r3, o2) => {
            e2 = r3, t2 = o2;
          });
          return J(this, { _chunkSteps: (t3) => e2({ value: t3, done: false }), _closeSteps: () => e2({ value: void 0, done: true }), _errorSteps: (e3) => t2(e3) }), r2;
        }
        releaseLock() {
          if (!X(this))
            throw K("releaseLock");
          if (this._ownerReadableStream !== void 0) {
            if (this._readRequests.length > 0)
              throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");
            T(this);
          }
        }
      }
      __name(ReadableStreamDefaultReader, "ReadableStreamDefaultReader");
      function X(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readRequests") && e2 instanceof ReadableStreamDefaultReader);
      }
      __name(X, "X");
      function J(e2, t2) {
        const r2 = e2._ownerReadableStream;
        r2._disturbed = true, r2._state === "closed" ? t2._closeSteps() : r2._state === "errored" ? t2._errorSteps(r2._storedError) : r2._readableStreamController[j](t2);
      }
      __name(J, "J");
      function K(e2) {
        return new TypeError(`ReadableStreamDefaultReader.prototype.${e2} can only be used on a ReadableStreamDefaultReader`);
      }
      __name(K, "K");
      Object.defineProperties(ReadableStreamDefaultReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ReadableStreamDefaultReader.prototype, t.toStringTag, { value: "ReadableStreamDefaultReader", configurable: true });
      class Z {
        constructor(e2, t2) {
          this._ongoingPromise = void 0, this._isFinished = false, this._reader = e2, this._preventCancel = t2;
        }
        next() {
          const e2 = /* @__PURE__ */ __name(() => this._nextSteps(), "e");
          return this._ongoingPromise = this._ongoingPromise ? m(this._ongoingPromise, e2, e2) : e2(), this._ongoingPromise;
        }
        return(e2) {
          const t2 = /* @__PURE__ */ __name(() => this._returnSteps(e2), "t");
          return this._ongoingPromise ? m(this._ongoingPromise, t2, t2) : t2();
        }
        _nextSteps() {
          if (this._isFinished)
            return Promise.resolve({ value: void 0, done: true });
          const e2 = this._reader;
          if (e2._ownerReadableStream === void 0)
            return d(C("iterate"));
          let t2, r2;
          const o2 = u((e3, o3) => {
            t2 = e3, r2 = o3;
          });
          return J(e2, { _chunkSteps: (e3) => {
            this._ongoingPromise = void 0, y(() => t2({ value: e3, done: false }));
          }, _closeSteps: () => {
            this._ongoingPromise = void 0, this._isFinished = true, T(e2), t2({ value: void 0, done: true });
          }, _errorSteps: (t3) => {
            this._ongoingPromise = void 0, this._isFinished = true, T(e2), r2(t3);
          } }), o2;
        }
        _returnSteps(e2) {
          if (this._isFinished)
            return Promise.resolve({ value: e2, done: true });
          this._isFinished = true;
          const t2 = this._reader;
          if (t2._ownerReadableStream === void 0)
            return d(C("finish iterating"));
          if (!this._preventCancel) {
            const r2 = R(t2, e2);
            return T(t2), m(r2, () => ({ value: e2, done: true }));
          }
          return T(t2), c({ value: e2, done: true });
        }
      }
      __name(Z, "Z");
      const ee = { next() {
        return te(this) ? this._asyncIteratorImpl.next() : d(re("next"));
      }, return(e2) {
        return te(this) ? this._asyncIteratorImpl.return(e2) : d(re("return"));
      } };
      function te(e2) {
        if (!o(e2))
          return false;
        if (!Object.prototype.hasOwnProperty.call(e2, "_asyncIteratorImpl"))
          return false;
        try {
          return e2._asyncIteratorImpl instanceof Z;
        } catch (e3) {
          return false;
        }
      }
      __name(te, "te");
      function re(e2) {
        return new TypeError(`ReadableStreamAsyncIterator.${e2} can only be used on a ReadableSteamAsyncIterator`);
      }
      __name(re, "re");
      typeof t.asyncIterator == "symbol" && Object.defineProperty(ee, t.asyncIterator, { value() {
        return this;
      }, writable: true, configurable: true });
      const oe = Number.isNaN || function(e2) {
        return e2 != e2;
      };
      function ne(e2) {
        return e2.slice();
      }
      __name(ne, "ne");
      function ae(e2, t2, r2, o2, n2) {
        new Uint8Array(e2).set(new Uint8Array(r2, o2, n2), t2);
      }
      __name(ae, "ae");
      function ie(e2, t2, r2) {
        if (e2.slice)
          return e2.slice(t2, r2);
        const o2 = r2 - t2, n2 = new ArrayBuffer(o2);
        return ae(n2, 0, e2, t2, o2), n2;
      }
      __name(ie, "ie");
      function le(e2) {
        const t2 = ie(e2.buffer, e2.byteOffset, e2.byteOffset + e2.byteLength);
        return new Uint8Array(t2);
      }
      __name(le, "le");
      function se(e2) {
        const t2 = e2._queue.shift();
        return e2._queueTotalSize -= t2.size, e2._queueTotalSize < 0 && (e2._queueTotalSize = 0), t2.value;
      }
      __name(se, "se");
      function ue(e2, t2, r2) {
        if (typeof (o2 = r2) != "number" || oe(o2) || o2 < 0 || r2 === 1 / 0)
          throw new RangeError("Size must be a finite, non-NaN, non-negative number.");
        var o2;
        e2._queue.push({ value: t2, size: r2 }), e2._queueTotalSize += r2;
      }
      __name(ue, "ue");
      function ce(e2) {
        e2._queue = new v(), e2._queueTotalSize = 0;
      }
      __name(ce, "ce");
      class ReadableStreamBYOBRequest {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        get view() {
          if (!fe(this))
            throw Ae("view");
          return this._view;
        }
        respond(e2) {
          if (!fe(this))
            throw Ae("respond");
          if (D(e2, 1, "respond"), e2 = Y(e2, "First parameter"), this._associatedReadableByteStreamController === void 0)
            throw new TypeError("This BYOB request has been invalidated");
          this._view.buffer, Be(this._associatedReadableByteStreamController, e2);
        }
        respondWithNewView(e2) {
          if (!fe(this))
            throw Ae("respondWithNewView");
          if (D(e2, 1, "respondWithNewView"), !ArrayBuffer.isView(e2))
            throw new TypeError("You can only respond with array buffer views");
          if (this._associatedReadableByteStreamController === void 0)
            throw new TypeError("This BYOB request has been invalidated");
          e2.buffer, ke(this._associatedReadableByteStreamController, e2);
        }
      }
      __name(ReadableStreamBYOBRequest, "ReadableStreamBYOBRequest");
      Object.defineProperties(ReadableStreamBYOBRequest.prototype, { respond: { enumerable: true }, respondWithNewView: { enumerable: true }, view: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ReadableStreamBYOBRequest.prototype, t.toStringTag, { value: "ReadableStreamBYOBRequest", configurable: true });
      class ReadableByteStreamController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        get byobRequest() {
          if (!de(this))
            throw ze("byobRequest");
          return We(this);
        }
        get desiredSize() {
          if (!de(this))
            throw ze("desiredSize");
          return Oe(this);
        }
        close() {
          if (!de(this))
            throw ze("close");
          if (this._closeRequested)
            throw new TypeError("The stream has already been closed; do not close it again!");
          const e2 = this._controlledReadableByteStream._state;
          if (e2 !== "readable")
            throw new TypeError(`The stream (in ${e2} state) is not in the readable state and cannot be closed`);
          qe(this);
        }
        enqueue(e2) {
          if (!de(this))
            throw ze("enqueue");
          if (D(e2, 1, "enqueue"), !ArrayBuffer.isView(e2))
            throw new TypeError("chunk must be an array buffer view");
          if (e2.byteLength === 0)
            throw new TypeError("chunk must have non-zero byteLength");
          if (e2.buffer.byteLength === 0)
            throw new TypeError("chunk's buffer must have non-zero byteLength");
          if (this._closeRequested)
            throw new TypeError("stream is closed or draining");
          const t2 = this._controlledReadableByteStream._state;
          if (t2 !== "readable")
            throw new TypeError(`The stream (in ${t2} state) is not in the readable state and cannot be enqueued to`);
          Pe(this, e2);
        }
        error(e2) {
          if (!de(this))
            throw ze("error");
          Ee(this, e2);
        }
        [k](e2) {
          _e(this), ce(this);
          const t2 = this._cancelAlgorithm(e2);
          return Ce(this), t2;
        }
        [j](e2) {
          const t2 = this._controlledReadableByteStream;
          if (this._queueTotalSize > 0) {
            const t3 = this._queue.shift();
            this._queueTotalSize -= t3.byteLength, Se(this);
            const r3 = new Uint8Array(t3.buffer, t3.byteOffset, t3.byteLength);
            return void e2._chunkSteps(r3);
          }
          const r2 = this._autoAllocateChunkSize;
          if (r2 !== void 0) {
            let t3;
            try {
              t3 = new ArrayBuffer(r2);
            } catch (t4) {
              return void e2._errorSteps(t4);
            }
            const o2 = { buffer: t3, bufferByteLength: r2, byteOffset: 0, byteLength: r2, bytesFilled: 0, elementSize: 1, viewConstructor: Uint8Array, readerType: "default" };
            this._pendingPullIntos.push(o2);
          }
          H(t2, e2), be(this);
        }
      }
      __name(ReadableByteStreamController, "ReadableByteStreamController");
      function de(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableByteStream") && e2 instanceof ReadableByteStreamController);
      }
      __name(de, "de");
      function fe(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_associatedReadableByteStreamController") && e2 instanceof ReadableStreamBYOBRequest);
      }
      __name(fe, "fe");
      function be(e2) {
        if (!function(e3) {
          const t2 = e3._controlledReadableByteStream;
          if (t2._state !== "readable")
            return false;
          if (e3._closeRequested)
            return false;
          if (!e3._started)
            return false;
          if (G(t2) && U(t2) > 0)
            return true;
          if (De(t2) && Le(t2) > 0)
            return true;
          if (Oe(e3) > 0)
            return true;
          return false;
        }(e2))
          return;
        if (e2._pulling)
          return void (e2._pullAgain = true);
        e2._pulling = true;
        b(e2._pullAlgorithm(), () => {
          e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, be(e2));
        }, (t2) => {
          Ee(e2, t2);
        });
      }
      __name(be, "be");
      function _e(e2) {
        ve(e2), e2._pendingPullIntos = new v();
      }
      __name(_e, "_e");
      function he(e2, t2) {
        let r2 = false;
        e2._state === "closed" && (r2 = true);
        const o2 = me(t2);
        t2.readerType === "default" ? V(e2, o2, r2) : function(e3, t3, r3) {
          const o3 = e3._reader._readIntoRequests.shift();
          r3 ? o3._closeSteps(t3) : o3._chunkSteps(t3);
        }(e2, o2, r2);
      }
      __name(he, "he");
      function me(e2) {
        const t2 = e2.bytesFilled, r2 = e2.elementSize;
        return new e2.viewConstructor(e2.buffer, e2.byteOffset, t2 / r2);
      }
      __name(me, "me");
      function pe(e2, t2, r2, o2) {
        e2._queue.push({ buffer: t2, byteOffset: r2, byteLength: o2 }), e2._queueTotalSize += o2;
      }
      __name(pe, "pe");
      function ye(e2, t2) {
        const r2 = t2.elementSize, o2 = t2.bytesFilled - t2.bytesFilled % r2, n2 = Math.min(e2._queueTotalSize, t2.byteLength - t2.bytesFilled), a2 = t2.bytesFilled + n2, i2 = a2 - a2 % r2;
        let l2 = n2, s2 = false;
        i2 > o2 && (l2 = i2 - t2.bytesFilled, s2 = true);
        const u2 = e2._queue;
        for (; l2 > 0; ) {
          const r3 = u2.peek(), o3 = Math.min(l2, r3.byteLength), n3 = t2.byteOffset + t2.bytesFilled;
          ae(t2.buffer, n3, r3.buffer, r3.byteOffset, o3), r3.byteLength === o3 ? u2.shift() : (r3.byteOffset += o3, r3.byteLength -= o3), e2._queueTotalSize -= o3, ge(e2, o3, t2), l2 -= o3;
        }
        return s2;
      }
      __name(ye, "ye");
      function ge(e2, t2, r2) {
        r2.bytesFilled += t2;
      }
      __name(ge, "ge");
      function Se(e2) {
        e2._queueTotalSize === 0 && e2._closeRequested ? (Ce(e2), fr(e2._controlledReadableByteStream)) : be(e2);
      }
      __name(Se, "Se");
      function ve(e2) {
        e2._byobRequest !== null && (e2._byobRequest._associatedReadableByteStreamController = void 0, e2._byobRequest._view = null, e2._byobRequest = null);
      }
      __name(ve, "ve");
      function we(e2) {
        for (; e2._pendingPullIntos.length > 0; ) {
          if (e2._queueTotalSize === 0)
            return;
          const t2 = e2._pendingPullIntos.peek();
          ye(e2, t2) && (Te(e2), he(e2._controlledReadableByteStream, t2));
        }
      }
      __name(we, "we");
      function Re(e2, t2) {
        const r2 = e2._pendingPullIntos.peek();
        ve(e2);
        e2._controlledReadableByteStream._state === "closed" ? function(e3, t3) {
          const r3 = e3._controlledReadableByteStream;
          if (De(r3))
            for (; Le(r3) > 0; )
              he(r3, Te(e3));
        }(e2) : function(e3, t3, r3) {
          if (ge(0, t3, r3), r3.bytesFilled < r3.elementSize)
            return;
          Te(e3);
          const o2 = r3.bytesFilled % r3.elementSize;
          if (o2 > 0) {
            const t4 = r3.byteOffset + r3.bytesFilled, n2 = ie(r3.buffer, t4 - o2, t4);
            pe(e3, n2, 0, n2.byteLength);
          }
          r3.bytesFilled -= o2, he(e3._controlledReadableByteStream, r3), we(e3);
        }(e2, t2, r2), be(e2);
      }
      __name(Re, "Re");
      function Te(e2) {
        return e2._pendingPullIntos.shift();
      }
      __name(Te, "Te");
      function Ce(e2) {
        e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0;
      }
      __name(Ce, "Ce");
      function qe(e2) {
        const t2 = e2._controlledReadableByteStream;
        if (!e2._closeRequested && t2._state === "readable")
          if (e2._queueTotalSize > 0)
            e2._closeRequested = true;
          else {
            if (e2._pendingPullIntos.length > 0) {
              if (e2._pendingPullIntos.peek().bytesFilled > 0) {
                const t3 = new TypeError("Insufficient bytes to fill elements in the given buffer");
                throw Ee(e2, t3), t3;
              }
            }
            Ce(e2), fr(t2);
          }
      }
      __name(qe, "qe");
      function Pe(e2, t2) {
        const r2 = e2._controlledReadableByteStream;
        if (e2._closeRequested || r2._state !== "readable")
          return;
        const o2 = t2.buffer, n2 = t2.byteOffset, a2 = t2.byteLength, i2 = o2;
        if (e2._pendingPullIntos.length > 0) {
          const t3 = e2._pendingPullIntos.peek();
          t3.buffer, 0, t3.buffer = t3.buffer;
        }
        if (ve(e2), G(r2))
          if (U(r2) === 0)
            pe(e2, i2, n2, a2);
          else {
            V(r2, new Uint8Array(i2, n2, a2), false);
          }
        else
          De(r2) ? (pe(e2, i2, n2, a2), we(e2)) : pe(e2, i2, n2, a2);
        be(e2);
      }
      __name(Pe, "Pe");
      function Ee(e2, t2) {
        const r2 = e2._controlledReadableByteStream;
        r2._state === "readable" && (_e(e2), ce(e2), Ce(e2), br(r2, t2));
      }
      __name(Ee, "Ee");
      function We(e2) {
        if (e2._byobRequest === null && e2._pendingPullIntos.length > 0) {
          const t2 = e2._pendingPullIntos.peek(), r2 = new Uint8Array(t2.buffer, t2.byteOffset + t2.bytesFilled, t2.byteLength - t2.bytesFilled), o2 = Object.create(ReadableStreamBYOBRequest.prototype);
          !function(e3, t3, r3) {
            e3._associatedReadableByteStreamController = t3, e3._view = r3;
          }(o2, e2, r2), e2._byobRequest = o2;
        }
        return e2._byobRequest;
      }
      __name(We, "We");
      function Oe(e2) {
        const t2 = e2._controlledReadableByteStream._state;
        return t2 === "errored" ? null : t2 === "closed" ? 0 : e2._strategyHWM - e2._queueTotalSize;
      }
      __name(Oe, "Oe");
      function Be(e2, t2) {
        const r2 = e2._pendingPullIntos.peek();
        if (e2._controlledReadableByteStream._state === "closed") {
          if (t2 !== 0)
            throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");
        } else {
          if (t2 === 0)
            throw new TypeError("bytesWritten must be greater than 0 when calling respond() on a readable stream");
          if (r2.bytesFilled + t2 > r2.byteLength)
            throw new RangeError("bytesWritten out of range");
        }
        r2.buffer = r2.buffer, Re(e2, t2);
      }
      __name(Be, "Be");
      function ke(e2, t2) {
        const r2 = e2._pendingPullIntos.peek();
        if (e2._controlledReadableByteStream._state === "closed") {
          if (t2.byteLength !== 0)
            throw new TypeError("The view's length must be 0 when calling respondWithNewView() on a closed stream");
        } else if (t2.byteLength === 0)
          throw new TypeError("The view's length must be greater than 0 when calling respondWithNewView() on a readable stream");
        if (r2.byteOffset + r2.bytesFilled !== t2.byteOffset)
          throw new RangeError("The region specified by view does not match byobRequest");
        if (r2.bufferByteLength !== t2.buffer.byteLength)
          throw new RangeError("The buffer of view has different capacity than byobRequest");
        if (r2.bytesFilled + t2.byteLength > r2.byteLength)
          throw new RangeError("The region specified by view is larger than byobRequest");
        r2.buffer = t2.buffer, Re(e2, t2.byteLength);
      }
      __name(ke, "ke");
      function je(e2, t2, r2, o2, n2, a2, i2) {
        t2._controlledReadableByteStream = e2, t2._pullAgain = false, t2._pulling = false, t2._byobRequest = null, t2._queue = t2._queueTotalSize = void 0, ce(t2), t2._closeRequested = false, t2._started = false, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, t2._autoAllocateChunkSize = i2, t2._pendingPullIntos = new v(), e2._readableStreamController = t2;
        b(c(r2()), () => {
          t2._started = true, be(t2);
        }, (e3) => {
          Ee(t2, e3);
        });
      }
      __name(je, "je");
      function Ae(e2) {
        return new TypeError(`ReadableStreamBYOBRequest.prototype.${e2} can only be used on a ReadableStreamBYOBRequest`);
      }
      __name(Ae, "Ae");
      function ze(e2) {
        return new TypeError(`ReadableByteStreamController.prototype.${e2} can only be used on a ReadableByteStreamController`);
      }
      __name(ze, "ze");
      function Fe(e2) {
        return new ReadableStreamBYOBReader(e2);
      }
      __name(Fe, "Fe");
      function Ie(e2, t2) {
        e2._reader._readIntoRequests.push(t2);
      }
      __name(Ie, "Ie");
      function Le(e2) {
        return e2._reader._readIntoRequests.length;
      }
      __name(Le, "Le");
      function De(e2) {
        const t2 = e2._reader;
        return t2 !== void 0 && !!$e(t2);
      }
      __name(De, "De");
      Object.defineProperties(ReadableByteStreamController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, byobRequest: { enumerable: true }, desiredSize: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ReadableByteStreamController.prototype, t.toStringTag, { value: "ReadableByteStreamController", configurable: true });
      class ReadableStreamBYOBReader {
        constructor(e2) {
          if (D(e2, 1, "ReadableStreamBYOBReader"), x(e2, "First parameter"), cr(e2))
            throw new TypeError("This stream has already been locked for exclusive reading by another reader");
          if (!de(e2._readableStreamController))
            throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");
          w(this, e2), this._readIntoRequests = new v();
        }
        get closed() {
          return $e(this) ? this._closedPromise : d(Qe("closed"));
        }
        cancel(e2) {
          return $e(this) ? this._ownerReadableStream === void 0 ? d(C("cancel")) : R(this, e2) : d(Qe("cancel"));
        }
        read(e2) {
          if (!$e(this))
            return d(Qe("read"));
          if (!ArrayBuffer.isView(e2))
            return d(new TypeError("view must be an array buffer view"));
          if (e2.byteLength === 0)
            return d(new TypeError("view must have non-zero byteLength"));
          if (e2.buffer.byteLength === 0)
            return d(new TypeError("view's buffer must have non-zero byteLength"));
          if (e2.buffer, this._ownerReadableStream === void 0)
            return d(C("read from"));
          let t2, r2;
          const o2 = u((e3, o3) => {
            t2 = e3, r2 = o3;
          });
          return Me(this, e2, { _chunkSteps: (e3) => t2({ value: e3, done: false }), _closeSteps: (e3) => t2({ value: e3, done: true }), _errorSteps: (e3) => r2(e3) }), o2;
        }
        releaseLock() {
          if (!$e(this))
            throw Qe("releaseLock");
          if (this._ownerReadableStream !== void 0) {
            if (this._readIntoRequests.length > 0)
              throw new TypeError("Tried to release a reader lock when that reader has pending read() calls un-settled");
            T(this);
          }
        }
      }
      __name(ReadableStreamBYOBReader, "ReadableStreamBYOBReader");
      function $e(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readIntoRequests") && e2 instanceof ReadableStreamBYOBReader);
      }
      __name($e, "$e");
      function Me(e2, t2, r2) {
        const o2 = e2._ownerReadableStream;
        o2._disturbed = true, o2._state === "errored" ? r2._errorSteps(o2._storedError) : function(e3, t3, r3) {
          const o3 = e3._controlledReadableByteStream;
          let n2 = 1;
          t3.constructor !== DataView && (n2 = t3.constructor.BYTES_PER_ELEMENT);
          const a2 = t3.constructor, i2 = t3.buffer, l2 = { buffer: i2, bufferByteLength: i2.byteLength, byteOffset: t3.byteOffset, byteLength: t3.byteLength, bytesFilled: 0, elementSize: n2, viewConstructor: a2, readerType: "byob" };
          if (e3._pendingPullIntos.length > 0)
            return e3._pendingPullIntos.push(l2), void Ie(o3, r3);
          if (o3._state !== "closed") {
            if (e3._queueTotalSize > 0) {
              if (ye(e3, l2)) {
                const t4 = me(l2);
                return Se(e3), void r3._chunkSteps(t4);
              }
              if (e3._closeRequested) {
                const t4 = new TypeError("Insufficient bytes to fill elements in the given buffer");
                return Ee(e3, t4), void r3._errorSteps(t4);
              }
            }
            e3._pendingPullIntos.push(l2), Ie(o3, r3), be(e3);
          } else {
            const e4 = new a2(l2.buffer, l2.byteOffset, 0);
            r3._closeSteps(e4);
          }
        }(o2._readableStreamController, t2, r2);
      }
      __name(Me, "Me");
      function Qe(e2) {
        return new TypeError(`ReadableStreamBYOBReader.prototype.${e2} can only be used on a ReadableStreamBYOBReader`);
      }
      __name(Qe, "Qe");
      function Ye(e2, t2) {
        const { highWaterMark: r2 } = e2;
        if (r2 === void 0)
          return t2;
        if (oe(r2) || r2 < 0)
          throw new RangeError("Invalid highWaterMark");
        return r2;
      }
      __name(Ye, "Ye");
      function xe(e2) {
        const { size: t2 } = e2;
        return t2 || (() => 1);
      }
      __name(xe, "xe");
      function Ne(e2, t2) {
        F(e2, t2);
        const r2 = e2 == null ? void 0 : e2.highWaterMark, o2 = e2 == null ? void 0 : e2.size;
        return { highWaterMark: r2 === void 0 ? void 0 : M(r2), size: o2 === void 0 ? void 0 : He(o2, `${t2} has member 'size' that`) };
      }
      __name(Ne, "Ne");
      function He(e2, t2) {
        return I(e2, t2), (t3) => M(e2(t3));
      }
      __name(He, "He");
      function Ve(e2, t2, r2) {
        return I(e2, r2), (r3) => S(e2, t2, [r3]);
      }
      __name(Ve, "Ve");
      function Ue(e2, t2, r2) {
        return I(e2, r2), () => S(e2, t2, []);
      }
      __name(Ue, "Ue");
      function Ge(e2, t2, r2) {
        return I(e2, r2), (r3) => g(e2, t2, [r3]);
      }
      __name(Ge, "Ge");
      function Xe(e2, t2, r2) {
        return I(e2, r2), (r3, o2) => S(e2, t2, [r3, o2]);
      }
      __name(Xe, "Xe");
      function Je(e2, t2) {
        if (!tt(e2))
          throw new TypeError(`${t2} is not a WritableStream.`);
      }
      __name(Je, "Je");
      Object.defineProperties(ReadableStreamBYOBReader.prototype, { cancel: { enumerable: true }, read: { enumerable: true }, releaseLock: { enumerable: true }, closed: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ReadableStreamBYOBReader.prototype, t.toStringTag, { value: "ReadableStreamBYOBReader", configurable: true });
      const Ke = typeof AbortController == "function";
      class WritableStream {
        constructor(e2 = {}, t2 = {}) {
          e2 === void 0 ? e2 = null : L(e2, "First parameter");
          const r2 = Ne(t2, "Second parameter"), o2 = function(e3, t3) {
            F(e3, t3);
            const r3 = e3 == null ? void 0 : e3.abort, o3 = e3 == null ? void 0 : e3.close, n3 = e3 == null ? void 0 : e3.start, a2 = e3 == null ? void 0 : e3.type, i2 = e3 == null ? void 0 : e3.write;
            return { abort: r3 === void 0 ? void 0 : Ve(r3, e3, `${t3} has member 'abort' that`), close: o3 === void 0 ? void 0 : Ue(o3, e3, `${t3} has member 'close' that`), start: n3 === void 0 ? void 0 : Ge(n3, e3, `${t3} has member 'start' that`), write: i2 === void 0 ? void 0 : Xe(i2, e3, `${t3} has member 'write' that`), type: a2 };
          }(e2, "First parameter");
          et(this);
          if (o2.type !== void 0)
            throw new RangeError("Invalid type is specified");
          const n2 = xe(r2);
          !function(e3, t3, r3, o3) {
            const n3 = Object.create(WritableStreamDefaultController.prototype);
            let a2 = /* @__PURE__ */ __name(() => {
            }, "a"), i2 = /* @__PURE__ */ __name(() => c(void 0), "i"), l2 = /* @__PURE__ */ __name(() => c(void 0), "l"), s2 = /* @__PURE__ */ __name(() => c(void 0), "s");
            t3.start !== void 0 && (a2 = /* @__PURE__ */ __name(() => t3.start(n3), "a"));
            t3.write !== void 0 && (i2 = /* @__PURE__ */ __name((e4) => t3.write(e4, n3), "i"));
            t3.close !== void 0 && (l2 = /* @__PURE__ */ __name(() => t3.close(), "l"));
            t3.abort !== void 0 && (s2 = /* @__PURE__ */ __name((e4) => t3.abort(e4), "s"));
            gt(e3, n3, a2, i2, l2, s2, r3, o3);
          }(this, o2, Ye(r2, 1), n2);
        }
        get locked() {
          if (!tt(this))
            throw qt("locked");
          return rt(this);
        }
        abort(e2) {
          return tt(this) ? rt(this) ? d(new TypeError("Cannot abort a stream that already has a writer")) : ot(this, e2) : d(qt("abort"));
        }
        close() {
          return tt(this) ? rt(this) ? d(new TypeError("Cannot close a stream that already has a writer")) : st(this) ? d(new TypeError("Cannot close an already-closing stream")) : nt(this) : d(qt("close"));
        }
        getWriter() {
          if (!tt(this))
            throw qt("getWriter");
          return Ze(this);
        }
      }
      __name(WritableStream, "WritableStream");
      function Ze(e2) {
        return new WritableStreamDefaultWriter(e2);
      }
      __name(Ze, "Ze");
      function et(e2) {
        e2._state = "writable", e2._storedError = void 0, e2._writer = void 0, e2._writableStreamController = void 0, e2._writeRequests = new v(), e2._inFlightWriteRequest = void 0, e2._closeRequest = void 0, e2._inFlightCloseRequest = void 0, e2._pendingAbortRequest = void 0, e2._backpressure = false;
      }
      __name(et, "et");
      function tt(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_writableStreamController") && e2 instanceof WritableStream);
      }
      __name(tt, "tt");
      function rt(e2) {
        return e2._writer !== void 0;
      }
      __name(rt, "rt");
      function ot(e2, t2) {
        var r2;
        if (e2._state === "closed" || e2._state === "errored")
          return c(void 0);
        e2._writableStreamController._abortReason = t2, (r2 = e2._writableStreamController._abortController) === null || r2 === void 0 || r2.abort();
        const o2 = e2._state;
        if (o2 === "closed" || o2 === "errored")
          return c(void 0);
        if (e2._pendingAbortRequest !== void 0)
          return e2._pendingAbortRequest._promise;
        let n2 = false;
        o2 === "erroring" && (n2 = true, t2 = void 0);
        const a2 = u((r3, o3) => {
          e2._pendingAbortRequest = { _promise: void 0, _resolve: r3, _reject: o3, _reason: t2, _wasAlreadyErroring: n2 };
        });
        return e2._pendingAbortRequest._promise = a2, n2 || it(e2, t2), a2;
      }
      __name(ot, "ot");
      function nt(e2) {
        const t2 = e2._state;
        if (t2 === "closed" || t2 === "errored")
          return d(new TypeError(`The stream (in ${t2} state) is not in the writable state and cannot be closed`));
        const r2 = u((t3, r3) => {
          const o3 = { _resolve: t3, _reject: r3 };
          e2._closeRequest = o3;
        }), o2 = e2._writer;
        var n2;
        return o2 !== void 0 && e2._backpressure && t2 === "writable" && Lt(o2), ue(n2 = e2._writableStreamController, pt, 0), wt(n2), r2;
      }
      __name(nt, "nt");
      function at(e2, t2) {
        e2._state !== "writable" ? lt(e2) : it(e2, t2);
      }
      __name(at, "at");
      function it(e2, t2) {
        const r2 = e2._writableStreamController;
        e2._state = "erroring", e2._storedError = t2;
        const o2 = e2._writer;
        o2 !== void 0 && _t(o2, t2), !function(e3) {
          if (e3._inFlightWriteRequest === void 0 && e3._inFlightCloseRequest === void 0)
            return false;
          return true;
        }(e2) && r2._started && lt(e2);
      }
      __name(it, "it");
      function lt(e2) {
        e2._state = "errored", e2._writableStreamController[B]();
        const t2 = e2._storedError;
        if (e2._writeRequests.forEach((e3) => {
          e3._reject(t2);
        }), e2._writeRequests = new v(), e2._pendingAbortRequest === void 0)
          return void ut(e2);
        const r2 = e2._pendingAbortRequest;
        if (e2._pendingAbortRequest = void 0, r2._wasAlreadyErroring)
          return r2._reject(t2), void ut(e2);
        b(e2._writableStreamController[O](r2._reason), () => {
          r2._resolve(), ut(e2);
        }, (t3) => {
          r2._reject(t3), ut(e2);
        });
      }
      __name(lt, "lt");
      function st(e2) {
        return e2._closeRequest !== void 0 || e2._inFlightCloseRequest !== void 0;
      }
      __name(st, "st");
      function ut(e2) {
        e2._closeRequest !== void 0 && (e2._closeRequest._reject(e2._storedError), e2._closeRequest = void 0);
        const t2 = e2._writer;
        t2 !== void 0 && kt(t2, e2._storedError);
      }
      __name(ut, "ut");
      function ct(e2, t2) {
        const r2 = e2._writer;
        r2 !== void 0 && t2 !== e2._backpressure && (t2 ? function(e3) {
          At(e3);
        }(r2) : Lt(r2)), e2._backpressure = t2;
      }
      __name(ct, "ct");
      Object.defineProperties(WritableStream.prototype, { abort: { enumerable: true }, close: { enumerable: true }, getWriter: { enumerable: true }, locked: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(WritableStream.prototype, t.toStringTag, { value: "WritableStream", configurable: true });
      class WritableStreamDefaultWriter {
        constructor(e2) {
          if (D(e2, 1, "WritableStreamDefaultWriter"), Je(e2, "First parameter"), rt(e2))
            throw new TypeError("This stream has already been locked for exclusive writing by another writer");
          this._ownerWritableStream = e2, e2._writer = this;
          const t2 = e2._state;
          if (t2 === "writable")
            !st(e2) && e2._backpressure ? At(this) : Ft(this), Ot(this);
          else if (t2 === "erroring")
            zt(this, e2._storedError), Ot(this);
          else if (t2 === "closed")
            Ft(this), Ot(r2 = this), jt(r2);
          else {
            const t3 = e2._storedError;
            zt(this, t3), Bt(this, t3);
          }
          var r2;
        }
        get closed() {
          return dt(this) ? this._closedPromise : d(Et("closed"));
        }
        get desiredSize() {
          if (!dt(this))
            throw Et("desiredSize");
          if (this._ownerWritableStream === void 0)
            throw Wt("desiredSize");
          return function(e2) {
            const t2 = e2._ownerWritableStream, r2 = t2._state;
            if (r2 === "errored" || r2 === "erroring")
              return null;
            if (r2 === "closed")
              return 0;
            return vt(t2._writableStreamController);
          }(this);
        }
        get ready() {
          return dt(this) ? this._readyPromise : d(Et("ready"));
        }
        abort(e2) {
          return dt(this) ? this._ownerWritableStream === void 0 ? d(Wt("abort")) : function(e3, t2) {
            return ot(e3._ownerWritableStream, t2);
          }(this, e2) : d(Et("abort"));
        }
        close() {
          if (!dt(this))
            return d(Et("close"));
          const e2 = this._ownerWritableStream;
          return e2 === void 0 ? d(Wt("close")) : st(e2) ? d(new TypeError("Cannot close an already-closing stream")) : ft(this);
        }
        releaseLock() {
          if (!dt(this))
            throw Et("releaseLock");
          this._ownerWritableStream !== void 0 && ht(this);
        }
        write(e2) {
          return dt(this) ? this._ownerWritableStream === void 0 ? d(Wt("write to")) : mt(this, e2) : d(Et("write"));
        }
      }
      __name(WritableStreamDefaultWriter, "WritableStreamDefaultWriter");
      function dt(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_ownerWritableStream") && e2 instanceof WritableStreamDefaultWriter);
      }
      __name(dt, "dt");
      function ft(e2) {
        return nt(e2._ownerWritableStream);
      }
      __name(ft, "ft");
      function bt(e2, t2) {
        e2._closedPromiseState === "pending" ? kt(e2, t2) : function(e3, t3) {
          Bt(e3, t3);
        }(e2, t2);
      }
      __name(bt, "bt");
      function _t(e2, t2) {
        e2._readyPromiseState === "pending" ? It(e2, t2) : function(e3, t3) {
          zt(e3, t3);
        }(e2, t2);
      }
      __name(_t, "_t");
      function ht(e2) {
        const t2 = e2._ownerWritableStream, r2 = new TypeError("Writer was released and can no longer be used to monitor the stream's closedness");
        _t(e2, r2), bt(e2, r2), t2._writer = void 0, e2._ownerWritableStream = void 0;
      }
      __name(ht, "ht");
      function mt(e2, t2) {
        const r2 = e2._ownerWritableStream, o2 = r2._writableStreamController, n2 = function(e3, t3) {
          try {
            return e3._strategySizeAlgorithm(t3);
          } catch (t4) {
            return Rt(e3, t4), 1;
          }
        }(o2, t2);
        if (r2 !== e2._ownerWritableStream)
          return d(Wt("write to"));
        const a2 = r2._state;
        if (a2 === "errored")
          return d(r2._storedError);
        if (st(r2) || a2 === "closed")
          return d(new TypeError("The stream is closing or closed and cannot be written to"));
        if (a2 === "erroring")
          return d(r2._storedError);
        const i2 = function(e3) {
          return u((t3, r3) => {
            const o3 = { _resolve: t3, _reject: r3 };
            e3._writeRequests.push(o3);
          });
        }(r2);
        return function(e3, t3, r3) {
          try {
            ue(e3, t3, r3);
          } catch (t4) {
            return void Rt(e3, t4);
          }
          const o3 = e3._controlledWritableStream;
          if (!st(o3) && o3._state === "writable") {
            ct(o3, Tt(e3));
          }
          wt(e3);
        }(o2, t2, n2), i2;
      }
      __name(mt, "mt");
      Object.defineProperties(WritableStreamDefaultWriter.prototype, { abort: { enumerable: true }, close: { enumerable: true }, releaseLock: { enumerable: true }, write: { enumerable: true }, closed: { enumerable: true }, desiredSize: { enumerable: true }, ready: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(WritableStreamDefaultWriter.prototype, t.toStringTag, { value: "WritableStreamDefaultWriter", configurable: true });
      const pt = {};
      class WritableStreamDefaultController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        get abortReason() {
          if (!yt(this))
            throw Pt("abortReason");
          return this._abortReason;
        }
        get signal() {
          if (!yt(this))
            throw Pt("signal");
          if (this._abortController === void 0)
            throw new TypeError("WritableStreamDefaultController.prototype.signal is not supported");
          return this._abortController.signal;
        }
        error(e2) {
          if (!yt(this))
            throw Pt("error");
          this._controlledWritableStream._state === "writable" && Ct(this, e2);
        }
        [O](e2) {
          const t2 = this._abortAlgorithm(e2);
          return St(this), t2;
        }
        [B]() {
          ce(this);
        }
      }
      __name(WritableStreamDefaultController, "WritableStreamDefaultController");
      function yt(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledWritableStream") && e2 instanceof WritableStreamDefaultController);
      }
      __name(yt, "yt");
      function gt(e2, t2, r2, o2, n2, a2, i2, l2) {
        t2._controlledWritableStream = e2, e2._writableStreamController = t2, t2._queue = void 0, t2._queueTotalSize = void 0, ce(t2), t2._abortReason = void 0, t2._abortController = function() {
          if (Ke)
            return new AbortController();
        }(), t2._started = false, t2._strategySizeAlgorithm = l2, t2._strategyHWM = i2, t2._writeAlgorithm = o2, t2._closeAlgorithm = n2, t2._abortAlgorithm = a2;
        const s2 = Tt(t2);
        ct(e2, s2);
        b(c(r2()), () => {
          t2._started = true, wt(t2);
        }, (r3) => {
          t2._started = true, at(e2, r3);
        });
      }
      __name(gt, "gt");
      function St(e2) {
        e2._writeAlgorithm = void 0, e2._closeAlgorithm = void 0, e2._abortAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
      }
      __name(St, "St");
      function vt(e2) {
        return e2._strategyHWM - e2._queueTotalSize;
      }
      __name(vt, "vt");
      function wt(e2) {
        const t2 = e2._controlledWritableStream;
        if (!e2._started)
          return;
        if (t2._inFlightWriteRequest !== void 0)
          return;
        if (t2._state === "erroring")
          return void lt(t2);
        if (e2._queue.length === 0)
          return;
        const r2 = e2._queue.peek().value;
        r2 === pt ? function(e3) {
          const t3 = e3._controlledWritableStream;
          (function(e4) {
            e4._inFlightCloseRequest = e4._closeRequest, e4._closeRequest = void 0;
          })(t3), se(e3);
          const r3 = e3._closeAlgorithm();
          St(e3), b(r3, () => {
            !function(e4) {
              e4._inFlightCloseRequest._resolve(void 0), e4._inFlightCloseRequest = void 0, e4._state === "erroring" && (e4._storedError = void 0, e4._pendingAbortRequest !== void 0 && (e4._pendingAbortRequest._resolve(), e4._pendingAbortRequest = void 0)), e4._state = "closed";
              const t4 = e4._writer;
              t4 !== void 0 && jt(t4);
            }(t3);
          }, (e4) => {
            !function(e5, t4) {
              e5._inFlightCloseRequest._reject(t4), e5._inFlightCloseRequest = void 0, e5._pendingAbortRequest !== void 0 && (e5._pendingAbortRequest._reject(t4), e5._pendingAbortRequest = void 0), at(e5, t4);
            }(t3, e4);
          });
        }(e2) : function(e3, t3) {
          const r3 = e3._controlledWritableStream;
          !function(e4) {
            e4._inFlightWriteRequest = e4._writeRequests.shift();
          }(r3);
          b(e3._writeAlgorithm(t3), () => {
            !function(e4) {
              e4._inFlightWriteRequest._resolve(void 0), e4._inFlightWriteRequest = void 0;
            }(r3);
            const t4 = r3._state;
            if (se(e3), !st(r3) && t4 === "writable") {
              const t5 = Tt(e3);
              ct(r3, t5);
            }
            wt(e3);
          }, (t4) => {
            r3._state === "writable" && St(e3), function(e4, t5) {
              e4._inFlightWriteRequest._reject(t5), e4._inFlightWriteRequest = void 0, at(e4, t5);
            }(r3, t4);
          });
        }(e2, r2);
      }
      __name(wt, "wt");
      function Rt(e2, t2) {
        e2._controlledWritableStream._state === "writable" && Ct(e2, t2);
      }
      __name(Rt, "Rt");
      function Tt(e2) {
        return vt(e2) <= 0;
      }
      __name(Tt, "Tt");
      function Ct(e2, t2) {
        const r2 = e2._controlledWritableStream;
        St(e2), it(r2, t2);
      }
      __name(Ct, "Ct");
      function qt(e2) {
        return new TypeError(`WritableStream.prototype.${e2} can only be used on a WritableStream`);
      }
      __name(qt, "qt");
      function Pt(e2) {
        return new TypeError(`WritableStreamDefaultController.prototype.${e2} can only be used on a WritableStreamDefaultController`);
      }
      __name(Pt, "Pt");
      function Et(e2) {
        return new TypeError(`WritableStreamDefaultWriter.prototype.${e2} can only be used on a WritableStreamDefaultWriter`);
      }
      __name(Et, "Et");
      function Wt(e2) {
        return new TypeError("Cannot " + e2 + " a stream using a released writer");
      }
      __name(Wt, "Wt");
      function Ot(e2) {
        e2._closedPromise = u((t2, r2) => {
          e2._closedPromise_resolve = t2, e2._closedPromise_reject = r2, e2._closedPromiseState = "pending";
        });
      }
      __name(Ot, "Ot");
      function Bt(e2, t2) {
        Ot(e2), kt(e2, t2);
      }
      __name(Bt, "Bt");
      function kt(e2, t2) {
        e2._closedPromise_reject !== void 0 && (p(e2._closedPromise), e2._closedPromise_reject(t2), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "rejected");
      }
      __name(kt, "kt");
      function jt(e2) {
        e2._closedPromise_resolve !== void 0 && (e2._closedPromise_resolve(void 0), e2._closedPromise_resolve = void 0, e2._closedPromise_reject = void 0, e2._closedPromiseState = "resolved");
      }
      __name(jt, "jt");
      function At(e2) {
        e2._readyPromise = u((t2, r2) => {
          e2._readyPromise_resolve = t2, e2._readyPromise_reject = r2;
        }), e2._readyPromiseState = "pending";
      }
      __name(At, "At");
      function zt(e2, t2) {
        At(e2), It(e2, t2);
      }
      __name(zt, "zt");
      function Ft(e2) {
        At(e2), Lt(e2);
      }
      __name(Ft, "Ft");
      function It(e2, t2) {
        e2._readyPromise_reject !== void 0 && (p(e2._readyPromise), e2._readyPromise_reject(t2), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "rejected");
      }
      __name(It, "It");
      function Lt(e2) {
        e2._readyPromise_resolve !== void 0 && (e2._readyPromise_resolve(void 0), e2._readyPromise_resolve = void 0, e2._readyPromise_reject = void 0, e2._readyPromiseState = "fulfilled");
      }
      __name(Lt, "Lt");
      Object.defineProperties(WritableStreamDefaultController.prototype, { error: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(WritableStreamDefaultController.prototype, t.toStringTag, { value: "WritableStreamDefaultController", configurable: true });
      const Dt = typeof DOMException != "undefined" ? DOMException : void 0;
      const $t = function(e2) {
        if (typeof e2 != "function" && typeof e2 != "object")
          return false;
        try {
          return new e2(), true;
        } catch (e3) {
          return false;
        }
      }(Dt) ? Dt : function() {
        const e2 = /* @__PURE__ */ __name(function(e3, t2) {
          this.message = e3 || "", this.name = t2 || "Error", Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
        }, "e");
        return e2.prototype = Object.create(Error.prototype), Object.defineProperty(e2.prototype, "constructor", { value: e2, writable: true, configurable: true }), e2;
      }();
      function Mt(e2, t2, o2, n2, a2, i2) {
        const l2 = N(e2), s2 = Ze(t2);
        e2._disturbed = true;
        let m2 = false, y2 = c(void 0);
        return u((g2, S2) => {
          let v2;
          if (i2 !== void 0) {
            if (v2 = /* @__PURE__ */ __name(() => {
              const r2 = new $t("Aborted", "AbortError"), o3 = [];
              n2 || o3.push(() => t2._state === "writable" ? ot(t2, r2) : c(void 0)), a2 || o3.push(() => e2._state === "readable" ? dr(e2, r2) : c(void 0)), E2(() => Promise.all(o3.map((e3) => e3())), true, r2);
            }, "v"), i2.aborted)
              return void v2();
            i2.addEventListener("abort", v2);
          }
          var w2, R2, C2;
          if (P2(e2, l2._closedPromise, (e3) => {
            n2 ? W2(true, e3) : E2(() => ot(t2, e3), true, e3);
          }), P2(t2, s2._closedPromise, (t3) => {
            a2 ? W2(true, t3) : E2(() => dr(e2, t3), true, t3);
          }), w2 = e2, R2 = l2._closedPromise, C2 = /* @__PURE__ */ __name(() => {
            o2 ? W2() : E2(() => function(e3) {
              const t3 = e3._ownerWritableStream, r2 = t3._state;
              return st(t3) || r2 === "closed" ? c(void 0) : r2 === "errored" ? d(t3._storedError) : ft(e3);
            }(s2));
          }, "C"), w2._state === "closed" ? C2() : _(R2, C2), st(t2) || t2._state === "closed") {
            const t3 = new TypeError("the destination writable stream closed before all data could be piped to it");
            a2 ? W2(true, t3) : E2(() => dr(e2, t3), true, t3);
          }
          function q2() {
            const e3 = y2;
            return f(y2, () => e3 !== y2 ? q2() : void 0);
          }
          __name(q2, "q");
          function P2(e3, t3, r2) {
            e3._state === "errored" ? r2(e3._storedError) : h(t3, r2);
          }
          __name(P2, "P");
          function E2(e3, r2, o3) {
            function n3() {
              b(e3(), () => O2(r2, o3), (e4) => O2(true, e4));
            }
            __name(n3, "n");
            m2 || (m2 = true, t2._state !== "writable" || st(t2) ? n3() : _(q2(), n3));
          }
          __name(E2, "E");
          function W2(e3, r2) {
            m2 || (m2 = true, t2._state !== "writable" || st(t2) ? O2(e3, r2) : _(q2(), () => O2(e3, r2)));
          }
          __name(W2, "W");
          function O2(e3, t3) {
            ht(s2), T(l2), i2 !== void 0 && i2.removeEventListener("abort", v2), e3 ? S2(t3) : g2(void 0);
          }
          __name(O2, "O");
          p(u((e3, t3) => {
            !(/* @__PURE__ */ __name(function o3(n3) {
              n3 ? e3() : f(m2 ? c(true) : f(s2._readyPromise, () => u((e4, t4) => {
                J(l2, { _chunkSteps: (t5) => {
                  y2 = f(mt(s2, t5), void 0, r), e4(false);
                }, _closeSteps: () => e4(true), _errorSteps: t4 });
              })), o3, t3);
            }, "o"))(false);
          }));
        });
      }
      __name(Mt, "Mt");
      class ReadableStreamDefaultController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        get desiredSize() {
          if (!Qt(this))
            throw Kt("desiredSize");
          return Gt(this);
        }
        close() {
          if (!Qt(this))
            throw Kt("close");
          if (!Xt(this))
            throw new TypeError("The stream is not in a state that permits close");
          Ht(this);
        }
        enqueue(e2) {
          if (!Qt(this))
            throw Kt("enqueue");
          if (!Xt(this))
            throw new TypeError("The stream is not in a state that permits enqueue");
          return Vt(this, e2);
        }
        error(e2) {
          if (!Qt(this))
            throw Kt("error");
          Ut(this, e2);
        }
        [k](e2) {
          ce(this);
          const t2 = this._cancelAlgorithm(e2);
          return Nt(this), t2;
        }
        [j](e2) {
          const t2 = this._controlledReadableStream;
          if (this._queue.length > 0) {
            const r2 = se(this);
            this._closeRequested && this._queue.length === 0 ? (Nt(this), fr(t2)) : Yt(this), e2._chunkSteps(r2);
          } else
            H(t2, e2), Yt(this);
        }
      }
      __name(ReadableStreamDefaultController, "ReadableStreamDefaultController");
      function Qt(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledReadableStream") && e2 instanceof ReadableStreamDefaultController);
      }
      __name(Qt, "Qt");
      function Yt(e2) {
        if (!xt(e2))
          return;
        if (e2._pulling)
          return void (e2._pullAgain = true);
        e2._pulling = true;
        b(e2._pullAlgorithm(), () => {
          e2._pulling = false, e2._pullAgain && (e2._pullAgain = false, Yt(e2));
        }, (t2) => {
          Ut(e2, t2);
        });
      }
      __name(Yt, "Yt");
      function xt(e2) {
        const t2 = e2._controlledReadableStream;
        if (!Xt(e2))
          return false;
        if (!e2._started)
          return false;
        if (cr(t2) && U(t2) > 0)
          return true;
        return Gt(e2) > 0;
      }
      __name(xt, "xt");
      function Nt(e2) {
        e2._pullAlgorithm = void 0, e2._cancelAlgorithm = void 0, e2._strategySizeAlgorithm = void 0;
      }
      __name(Nt, "Nt");
      function Ht(e2) {
        if (!Xt(e2))
          return;
        const t2 = e2._controlledReadableStream;
        e2._closeRequested = true, e2._queue.length === 0 && (Nt(e2), fr(t2));
      }
      __name(Ht, "Ht");
      function Vt(e2, t2) {
        if (!Xt(e2))
          return;
        const r2 = e2._controlledReadableStream;
        if (cr(r2) && U(r2) > 0)
          V(r2, t2, false);
        else {
          let r3;
          try {
            r3 = e2._strategySizeAlgorithm(t2);
          } catch (t3) {
            throw Ut(e2, t3), t3;
          }
          try {
            ue(e2, t2, r3);
          } catch (t3) {
            throw Ut(e2, t3), t3;
          }
        }
        Yt(e2);
      }
      __name(Vt, "Vt");
      function Ut(e2, t2) {
        const r2 = e2._controlledReadableStream;
        r2._state === "readable" && (ce(e2), Nt(e2), br(r2, t2));
      }
      __name(Ut, "Ut");
      function Gt(e2) {
        const t2 = e2._controlledReadableStream._state;
        return t2 === "errored" ? null : t2 === "closed" ? 0 : e2._strategyHWM - e2._queueTotalSize;
      }
      __name(Gt, "Gt");
      function Xt(e2) {
        const t2 = e2._controlledReadableStream._state;
        return !e2._closeRequested && t2 === "readable";
      }
      __name(Xt, "Xt");
      function Jt(e2, t2, r2, o2, n2, a2, i2) {
        t2._controlledReadableStream = e2, t2._queue = void 0, t2._queueTotalSize = void 0, ce(t2), t2._started = false, t2._closeRequested = false, t2._pullAgain = false, t2._pulling = false, t2._strategySizeAlgorithm = i2, t2._strategyHWM = a2, t2._pullAlgorithm = o2, t2._cancelAlgorithm = n2, e2._readableStreamController = t2;
        b(c(r2()), () => {
          t2._started = true, Yt(t2);
        }, (e3) => {
          Ut(t2, e3);
        });
      }
      __name(Jt, "Jt");
      function Kt(e2) {
        return new TypeError(`ReadableStreamDefaultController.prototype.${e2} can only be used on a ReadableStreamDefaultController`);
      }
      __name(Kt, "Kt");
      function Zt(e2, t2) {
        return de(e2._readableStreamController) ? function(e3) {
          let t3, r2, o2, n2, a2, i2 = N(e3), l2 = false, s2 = false, d2 = false;
          const f2 = u((e4) => {
            a2 = e4;
          });
          function b2(e4) {
            h(e4._closedPromise, (t4) => {
              e4 === i2 && (Ee(o2._readableStreamController, t4), Ee(n2._readableStreamController, t4), s2 && d2 || a2(void 0));
            });
          }
          __name(b2, "b");
          function _2() {
            $e(i2) && (T(i2), i2 = N(e3), b2(i2));
            J(i2, { _chunkSteps: (t4) => {
              y(() => {
                l2 = false;
                const r3 = t4;
                let i3 = t4;
                if (!s2 && !d2)
                  try {
                    i3 = le(t4);
                  } catch (t5) {
                    return Ee(o2._readableStreamController, t5), Ee(n2._readableStreamController, t5), void a2(dr(e3, t5));
                  }
                s2 || Pe(o2._readableStreamController, r3), d2 || Pe(n2._readableStreamController, i3);
              });
            }, _closeSteps: () => {
              l2 = false, s2 || qe(o2._readableStreamController), d2 || qe(n2._readableStreamController), o2._readableStreamController._pendingPullIntos.length > 0 && Be(o2._readableStreamController, 0), n2._readableStreamController._pendingPullIntos.length > 0 && Be(n2._readableStreamController, 0), s2 && d2 || a2(void 0);
            }, _errorSteps: () => {
              l2 = false;
            } });
          }
          __name(_2, "_");
          function m2(t4, r3) {
            X(i2) && (T(i2), i2 = Fe(e3), b2(i2));
            const u2 = r3 ? n2 : o2, c2 = r3 ? o2 : n2;
            Me(i2, t4, { _chunkSteps: (t5) => {
              y(() => {
                l2 = false;
                const o3 = r3 ? d2 : s2;
                if (r3 ? s2 : d2)
                  o3 || ke(u2._readableStreamController, t5);
                else {
                  let r4;
                  try {
                    r4 = le(t5);
                  } catch (t6) {
                    return Ee(u2._readableStreamController, t6), Ee(c2._readableStreamController, t6), void a2(dr(e3, t6));
                  }
                  o3 || ke(u2._readableStreamController, t5), Pe(c2._readableStreamController, r4);
                }
              });
            }, _closeSteps: (e4) => {
              l2 = false;
              const t5 = r3 ? d2 : s2, o3 = r3 ? s2 : d2;
              t5 || qe(u2._readableStreamController), o3 || qe(c2._readableStreamController), e4 !== void 0 && (t5 || ke(u2._readableStreamController, e4), !o3 && c2._readableStreamController._pendingPullIntos.length > 0 && Be(c2._readableStreamController, 0)), t5 && o3 || a2(void 0);
            }, _errorSteps: () => {
              l2 = false;
            } });
          }
          __name(m2, "m");
          function p2() {
            if (l2)
              return c(void 0);
            l2 = true;
            const e4 = We(o2._readableStreamController);
            return e4 === null ? _2() : m2(e4._view, false), c(void 0);
          }
          __name(p2, "p");
          function g2() {
            if (l2)
              return c(void 0);
            l2 = true;
            const e4 = We(n2._readableStreamController);
            return e4 === null ? _2() : m2(e4._view, true), c(void 0);
          }
          __name(g2, "g");
          function S2(o3) {
            if (s2 = true, t3 = o3, d2) {
              const o4 = ne([t3, r2]), n3 = dr(e3, o4);
              a2(n3);
            }
            return f2;
          }
          __name(S2, "S");
          function v2(o3) {
            if (d2 = true, r2 = o3, s2) {
              const o4 = ne([t3, r2]), n3 = dr(e3, o4);
              a2(n3);
            }
            return f2;
          }
          __name(v2, "v");
          function w2() {
          }
          __name(w2, "w");
          return o2 = lr(w2, p2, S2), n2 = lr(w2, g2, v2), b2(i2), [o2, n2];
        }(e2) : function(e3, t3) {
          const r2 = N(e3);
          let o2, n2, a2, i2, l2, s2 = false, d2 = false, f2 = false;
          const b2 = u((e4) => {
            l2 = e4;
          });
          function _2() {
            if (s2)
              return c(void 0);
            s2 = true;
            return J(r2, { _chunkSteps: (e4) => {
              y(() => {
                s2 = false;
                const t4 = e4, r3 = e4;
                d2 || Vt(a2._readableStreamController, t4), f2 || Vt(i2._readableStreamController, r3);
              });
            }, _closeSteps: () => {
              s2 = false, d2 || Ht(a2._readableStreamController), f2 || Ht(i2._readableStreamController), d2 && f2 || l2(void 0);
            }, _errorSteps: () => {
              s2 = false;
            } }), c(void 0);
          }
          __name(_2, "_");
          function m2(t4) {
            if (d2 = true, o2 = t4, f2) {
              const t5 = ne([o2, n2]), r3 = dr(e3, t5);
              l2(r3);
            }
            return b2;
          }
          __name(m2, "m");
          function p2(t4) {
            if (f2 = true, n2 = t4, d2) {
              const t5 = ne([o2, n2]), r3 = dr(e3, t5);
              l2(r3);
            }
            return b2;
          }
          __name(p2, "p");
          function g2() {
          }
          __name(g2, "g");
          return a2 = ir(g2, _2, m2), i2 = ir(g2, _2, p2), h(r2._closedPromise, (e4) => {
            Ut(a2._readableStreamController, e4), Ut(i2._readableStreamController, e4), d2 && f2 || l2(void 0);
          }), [a2, i2];
        }(e2);
      }
      __name(Zt, "Zt");
      function er(e2, t2, r2) {
        return I(e2, r2), (r3) => S(e2, t2, [r3]);
      }
      __name(er, "er");
      function tr(e2, t2, r2) {
        return I(e2, r2), (r3) => S(e2, t2, [r3]);
      }
      __name(tr, "tr");
      function rr(e2, t2, r2) {
        return I(e2, r2), (r3) => g(e2, t2, [r3]);
      }
      __name(rr, "rr");
      function or(e2, t2) {
        if ((e2 = `${e2}`) !== "bytes")
          throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamType`);
        return e2;
      }
      __name(or, "or");
      function nr(e2, t2) {
        if ((e2 = `${e2}`) !== "byob")
          throw new TypeError(`${t2} '${e2}' is not a valid enumeration value for ReadableStreamReaderMode`);
        return e2;
      }
      __name(nr, "nr");
      function ar(e2, t2) {
        F(e2, t2);
        const r2 = e2 == null ? void 0 : e2.preventAbort, o2 = e2 == null ? void 0 : e2.preventCancel, n2 = e2 == null ? void 0 : e2.preventClose, a2 = e2 == null ? void 0 : e2.signal;
        return a2 !== void 0 && function(e3, t3) {
          if (!function(e4) {
            if (typeof e4 != "object" || e4 === null)
              return false;
            try {
              return typeof e4.aborted == "boolean";
            } catch (e5) {
              return false;
            }
          }(e3))
            throw new TypeError(`${t3} is not an AbortSignal.`);
        }(a2, `${t2} has member 'signal' that`), { preventAbort: Boolean(r2), preventCancel: Boolean(o2), preventClose: Boolean(n2), signal: a2 };
      }
      __name(ar, "ar");
      Object.defineProperties(ReadableStreamDefaultController.prototype, { close: { enumerable: true }, enqueue: { enumerable: true }, error: { enumerable: true }, desiredSize: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ReadableStreamDefaultController.prototype, t.toStringTag, { value: "ReadableStreamDefaultController", configurable: true });
      class ReadableStream {
        constructor(e2 = {}, t2 = {}) {
          e2 === void 0 ? e2 = null : L(e2, "First parameter");
          const r2 = Ne(t2, "Second parameter"), o2 = function(e3, t3) {
            F(e3, t3);
            const r3 = e3, o3 = r3 == null ? void 0 : r3.autoAllocateChunkSize, n2 = r3 == null ? void 0 : r3.cancel, a2 = r3 == null ? void 0 : r3.pull, i2 = r3 == null ? void 0 : r3.start, l2 = r3 == null ? void 0 : r3.type;
            return { autoAllocateChunkSize: o3 === void 0 ? void 0 : Y(o3, `${t3} has member 'autoAllocateChunkSize' that`), cancel: n2 === void 0 ? void 0 : er(n2, r3, `${t3} has member 'cancel' that`), pull: a2 === void 0 ? void 0 : tr(a2, r3, `${t3} has member 'pull' that`), start: i2 === void 0 ? void 0 : rr(i2, r3, `${t3} has member 'start' that`), type: l2 === void 0 ? void 0 : or(l2, `${t3} has member 'type' that`) };
          }(e2, "First parameter");
          if (sr(this), o2.type === "bytes") {
            if (r2.size !== void 0)
              throw new RangeError("The strategy for a byte stream cannot have a size function");
            !function(e3, t3, r3) {
              const o3 = Object.create(ReadableByteStreamController.prototype);
              let n2 = /* @__PURE__ */ __name(() => {
              }, "n"), a2 = /* @__PURE__ */ __name(() => c(void 0), "a"), i2 = /* @__PURE__ */ __name(() => c(void 0), "i");
              t3.start !== void 0 && (n2 = /* @__PURE__ */ __name(() => t3.start(o3), "n")), t3.pull !== void 0 && (a2 = /* @__PURE__ */ __name(() => t3.pull(o3), "a")), t3.cancel !== void 0 && (i2 = /* @__PURE__ */ __name((e4) => t3.cancel(e4), "i"));
              const l2 = t3.autoAllocateChunkSize;
              if (l2 === 0)
                throw new TypeError("autoAllocateChunkSize must be greater than 0");
              je(e3, o3, n2, a2, i2, r3, l2);
            }(this, o2, Ye(r2, 0));
          } else {
            const e3 = xe(r2);
            !function(e4, t3, r3, o3) {
              const n2 = Object.create(ReadableStreamDefaultController.prototype);
              let a2 = /* @__PURE__ */ __name(() => {
              }, "a"), i2 = /* @__PURE__ */ __name(() => c(void 0), "i"), l2 = /* @__PURE__ */ __name(() => c(void 0), "l");
              t3.start !== void 0 && (a2 = /* @__PURE__ */ __name(() => t3.start(n2), "a")), t3.pull !== void 0 && (i2 = /* @__PURE__ */ __name(() => t3.pull(n2), "i")), t3.cancel !== void 0 && (l2 = /* @__PURE__ */ __name((e5) => t3.cancel(e5), "l")), Jt(e4, n2, a2, i2, l2, r3, o3);
            }(this, o2, Ye(r2, 1), e3);
          }
        }
        get locked() {
          if (!ur(this))
            throw _r("locked");
          return cr(this);
        }
        cancel(e2) {
          return ur(this) ? cr(this) ? d(new TypeError("Cannot cancel a stream that already has a reader")) : dr(this, e2) : d(_r("cancel"));
        }
        getReader(e2) {
          if (!ur(this))
            throw _r("getReader");
          return function(e3, t2) {
            F(e3, t2);
            const r2 = e3 == null ? void 0 : e3.mode;
            return { mode: r2 === void 0 ? void 0 : nr(r2, `${t2} has member 'mode' that`) };
          }(e2, "First parameter").mode === void 0 ? N(this) : Fe(this);
        }
        pipeThrough(e2, t2 = {}) {
          if (!ur(this))
            throw _r("pipeThrough");
          D(e2, 1, "pipeThrough");
          const r2 = function(e3, t3) {
            F(e3, t3);
            const r3 = e3 == null ? void 0 : e3.readable;
            $(r3, "readable", "ReadableWritablePair"), x(r3, `${t3} has member 'readable' that`);
            const o3 = e3 == null ? void 0 : e3.writable;
            return $(o3, "writable", "ReadableWritablePair"), Je(o3, `${t3} has member 'writable' that`), { readable: r3, writable: o3 };
          }(e2, "First parameter"), o2 = ar(t2, "Second parameter");
          if (cr(this))
            throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream");
          if (rt(r2.writable))
            throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream");
          return p(Mt(this, r2.writable, o2.preventClose, o2.preventAbort, o2.preventCancel, o2.signal)), r2.readable;
        }
        pipeTo(e2, t2 = {}) {
          if (!ur(this))
            return d(_r("pipeTo"));
          if (e2 === void 0)
            return d("Parameter 1 is required in 'pipeTo'.");
          if (!tt(e2))
            return d(new TypeError("ReadableStream.prototype.pipeTo's first argument must be a WritableStream"));
          let r2;
          try {
            r2 = ar(t2, "Second parameter");
          } catch (e3) {
            return d(e3);
          }
          return cr(this) ? d(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream")) : rt(e2) ? d(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream")) : Mt(this, e2, r2.preventClose, r2.preventAbort, r2.preventCancel, r2.signal);
        }
        tee() {
          if (!ur(this))
            throw _r("tee");
          return ne(Zt(this));
        }
        values(e2) {
          if (!ur(this))
            throw _r("values");
          return function(e3, t2) {
            const r2 = N(e3), o2 = new Z(r2, t2), n2 = Object.create(ee);
            return n2._asyncIteratorImpl = o2, n2;
          }(this, function(e3, t2) {
            F(e3, t2);
            const r2 = e3 == null ? void 0 : e3.preventCancel;
            return { preventCancel: Boolean(r2) };
          }(e2, "First parameter").preventCancel);
        }
      }
      __name(ReadableStream, "ReadableStream");
      function ir(e2, t2, r2, o2 = 1, n2 = () => 1) {
        const a2 = Object.create(ReadableStream.prototype);
        sr(a2);
        return Jt(a2, Object.create(ReadableStreamDefaultController.prototype), e2, t2, r2, o2, n2), a2;
      }
      __name(ir, "ir");
      function lr(e2, t2, r2) {
        const o2 = Object.create(ReadableStream.prototype);
        sr(o2);
        return je(o2, Object.create(ReadableByteStreamController.prototype), e2, t2, r2, 0, void 0), o2;
      }
      __name(lr, "lr");
      function sr(e2) {
        e2._state = "readable", e2._reader = void 0, e2._storedError = void 0, e2._disturbed = false;
      }
      __name(sr, "sr");
      function ur(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_readableStreamController") && e2 instanceof ReadableStream);
      }
      __name(ur, "ur");
      function cr(e2) {
        return e2._reader !== void 0;
      }
      __name(cr, "cr");
      function dr(e2, t2) {
        if (e2._disturbed = true, e2._state === "closed")
          return c(void 0);
        if (e2._state === "errored")
          return d(e2._storedError);
        fr(e2);
        const o2 = e2._reader;
        o2 !== void 0 && $e(o2) && (o2._readIntoRequests.forEach((e3) => {
          e3._closeSteps(void 0);
        }), o2._readIntoRequests = new v());
        return m(e2._readableStreamController[k](t2), r);
      }
      __name(dr, "dr");
      function fr(e2) {
        e2._state = "closed";
        const t2 = e2._reader;
        t2 !== void 0 && (W(t2), X(t2) && (t2._readRequests.forEach((e3) => {
          e3._closeSteps();
        }), t2._readRequests = new v()));
      }
      __name(fr, "fr");
      function br(e2, t2) {
        e2._state = "errored", e2._storedError = t2;
        const r2 = e2._reader;
        r2 !== void 0 && (E(r2, t2), X(r2) ? (r2._readRequests.forEach((e3) => {
          e3._errorSteps(t2);
        }), r2._readRequests = new v()) : (r2._readIntoRequests.forEach((e3) => {
          e3._errorSteps(t2);
        }), r2._readIntoRequests = new v()));
      }
      __name(br, "br");
      function _r(e2) {
        return new TypeError(`ReadableStream.prototype.${e2} can only be used on a ReadableStream`);
      }
      __name(_r, "_r");
      function hr(e2, t2) {
        F(e2, t2);
        const r2 = e2 == null ? void 0 : e2.highWaterMark;
        return $(r2, "highWaterMark", "QueuingStrategyInit"), { highWaterMark: M(r2) };
      }
      __name(hr, "hr");
      Object.defineProperties(ReadableStream.prototype, { cancel: { enumerable: true }, getReader: { enumerable: true }, pipeThrough: { enumerable: true }, pipeTo: { enumerable: true }, tee: { enumerable: true }, values: { enumerable: true }, locked: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ReadableStream.prototype, t.toStringTag, { value: "ReadableStream", configurable: true }), typeof t.asyncIterator == "symbol" && Object.defineProperty(ReadableStream.prototype, t.asyncIterator, { value: ReadableStream.prototype.values, writable: true, configurable: true });
      const mr = /* @__PURE__ */ __name((e2) => e2.byteLength, "mr");
      Object.defineProperty(mr, "name", { value: "size", configurable: true });
      class ByteLengthQueuingStrategy {
        constructor(e2) {
          D(e2, 1, "ByteLengthQueuingStrategy"), e2 = hr(e2, "First parameter"), this._byteLengthQueuingStrategyHighWaterMark = e2.highWaterMark;
        }
        get highWaterMark() {
          if (!yr(this))
            throw pr("highWaterMark");
          return this._byteLengthQueuingStrategyHighWaterMark;
        }
        get size() {
          if (!yr(this))
            throw pr("size");
          return mr;
        }
      }
      __name(ByteLengthQueuingStrategy, "ByteLengthQueuingStrategy");
      function pr(e2) {
        return new TypeError(`ByteLengthQueuingStrategy.prototype.${e2} can only be used on a ByteLengthQueuingStrategy`);
      }
      __name(pr, "pr");
      function yr(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_byteLengthQueuingStrategyHighWaterMark") && e2 instanceof ByteLengthQueuingStrategy);
      }
      __name(yr, "yr");
      Object.defineProperties(ByteLengthQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(ByteLengthQueuingStrategy.prototype, t.toStringTag, { value: "ByteLengthQueuingStrategy", configurable: true });
      const gr = /* @__PURE__ */ __name(() => 1, "gr");
      Object.defineProperty(gr, "name", { value: "size", configurable: true });
      class CountQueuingStrategy {
        constructor(e2) {
          D(e2, 1, "CountQueuingStrategy"), e2 = hr(e2, "First parameter"), this._countQueuingStrategyHighWaterMark = e2.highWaterMark;
        }
        get highWaterMark() {
          if (!vr(this))
            throw Sr("highWaterMark");
          return this._countQueuingStrategyHighWaterMark;
        }
        get size() {
          if (!vr(this))
            throw Sr("size");
          return gr;
        }
      }
      __name(CountQueuingStrategy, "CountQueuingStrategy");
      function Sr(e2) {
        return new TypeError(`CountQueuingStrategy.prototype.${e2} can only be used on a CountQueuingStrategy`);
      }
      __name(Sr, "Sr");
      function vr(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_countQueuingStrategyHighWaterMark") && e2 instanceof CountQueuingStrategy);
      }
      __name(vr, "vr");
      function wr(e2, t2, r2) {
        return I(e2, r2), (r3) => S(e2, t2, [r3]);
      }
      __name(wr, "wr");
      function Rr(e2, t2, r2) {
        return I(e2, r2), (r3) => g(e2, t2, [r3]);
      }
      __name(Rr, "Rr");
      function Tr(e2, t2, r2) {
        return I(e2, r2), (r3, o2) => S(e2, t2, [r3, o2]);
      }
      __name(Tr, "Tr");
      Object.defineProperties(CountQueuingStrategy.prototype, { highWaterMark: { enumerable: true }, size: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(CountQueuingStrategy.prototype, t.toStringTag, { value: "CountQueuingStrategy", configurable: true });
      class TransformStream {
        constructor(e2 = {}, t2 = {}, r2 = {}) {
          e2 === void 0 && (e2 = null);
          const o2 = Ne(t2, "Second parameter"), n2 = Ne(r2, "Third parameter"), a2 = function(e3, t3) {
            F(e3, t3);
            const r3 = e3 == null ? void 0 : e3.flush, o3 = e3 == null ? void 0 : e3.readableType, n3 = e3 == null ? void 0 : e3.start, a3 = e3 == null ? void 0 : e3.transform, i3 = e3 == null ? void 0 : e3.writableType;
            return { flush: r3 === void 0 ? void 0 : wr(r3, e3, `${t3} has member 'flush' that`), readableType: o3, start: n3 === void 0 ? void 0 : Rr(n3, e3, `${t3} has member 'start' that`), transform: a3 === void 0 ? void 0 : Tr(a3, e3, `${t3} has member 'transform' that`), writableType: i3 };
          }(e2, "First parameter");
          if (a2.readableType !== void 0)
            throw new RangeError("Invalid readableType specified");
          if (a2.writableType !== void 0)
            throw new RangeError("Invalid writableType specified");
          const i2 = Ye(n2, 0), l2 = xe(n2), s2 = Ye(o2, 1), f2 = xe(o2);
          let b2;
          !function(e3, t3, r3, o3, n3, a3) {
            function i3() {
              return t3;
            }
            __name(i3, "i");
            function l3(t4) {
              return function(e4, t5) {
                const r4 = e4._transformStreamController;
                if (e4._backpressure) {
                  return m(e4._backpressureChangePromise, () => {
                    const o4 = e4._writable;
                    if (o4._state === "erroring")
                      throw o4._storedError;
                    return kr(r4, t5);
                  });
                }
                return kr(r4, t5);
              }(e3, t4);
            }
            __name(l3, "l");
            function s3(t4) {
              return function(e4, t5) {
                return qr(e4, t5), c(void 0);
              }(e3, t4);
            }
            __name(s3, "s");
            function u2() {
              return function(e4) {
                const t4 = e4._readable, r4 = e4._transformStreamController, o4 = r4._flushAlgorithm();
                return Or(r4), m(o4, () => {
                  if (t4._state === "errored")
                    throw t4._storedError;
                  Ht(t4._readableStreamController);
                }, (r5) => {
                  throw qr(e4, r5), t4._storedError;
                });
              }(e3);
            }
            __name(u2, "u");
            function d2() {
              return function(e4) {
                return Er(e4, false), e4._backpressureChangePromise;
              }(e3);
            }
            __name(d2, "d");
            function f3(t4) {
              return Pr(e3, t4), c(void 0);
            }
            __name(f3, "f");
            e3._writable = function(e4, t4, r4, o4, n4 = 1, a4 = () => 1) {
              const i4 = Object.create(WritableStream.prototype);
              return et(i4), gt(i4, Object.create(WritableStreamDefaultController.prototype), e4, t4, r4, o4, n4, a4), i4;
            }(i3, l3, u2, s3, r3, o3), e3._readable = ir(i3, d2, f3, n3, a3), e3._backpressure = void 0, e3._backpressureChangePromise = void 0, e3._backpressureChangePromise_resolve = void 0, Er(e3, true), e3._transformStreamController = void 0;
          }(this, u((e3) => {
            b2 = e3;
          }), s2, f2, i2, l2), function(e3, t3) {
            const r3 = Object.create(TransformStreamDefaultController.prototype);
            let o3 = /* @__PURE__ */ __name((e4) => {
              try {
                return Br(r3, e4), c(void 0);
              } catch (e5) {
                return d(e5);
              }
            }, "o"), n3 = /* @__PURE__ */ __name(() => c(void 0), "n");
            t3.transform !== void 0 && (o3 = /* @__PURE__ */ __name((e4) => t3.transform(e4, r3), "o"));
            t3.flush !== void 0 && (n3 = /* @__PURE__ */ __name(() => t3.flush(r3), "n"));
            !function(e4, t4, r4, o4) {
              t4._controlledTransformStream = e4, e4._transformStreamController = t4, t4._transformAlgorithm = r4, t4._flushAlgorithm = o4;
            }(e3, r3, o3, n3);
          }(this, a2), a2.start !== void 0 ? b2(a2.start(this._transformStreamController)) : b2(void 0);
        }
        get readable() {
          if (!Cr(this))
            throw Ar("readable");
          return this._readable;
        }
        get writable() {
          if (!Cr(this))
            throw Ar("writable");
          return this._writable;
        }
      }
      __name(TransformStream, "TransformStream");
      function Cr(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_transformStreamController") && e2 instanceof TransformStream);
      }
      __name(Cr, "Cr");
      function qr(e2, t2) {
        Ut(e2._readable._readableStreamController, t2), Pr(e2, t2);
      }
      __name(qr, "qr");
      function Pr(e2, t2) {
        Or(e2._transformStreamController), Rt(e2._writable._writableStreamController, t2), e2._backpressure && Er(e2, false);
      }
      __name(Pr, "Pr");
      function Er(e2, t2) {
        e2._backpressureChangePromise !== void 0 && e2._backpressureChangePromise_resolve(), e2._backpressureChangePromise = u((t3) => {
          e2._backpressureChangePromise_resolve = t3;
        }), e2._backpressure = t2;
      }
      __name(Er, "Er");
      Object.defineProperties(TransformStream.prototype, { readable: { enumerable: true }, writable: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(TransformStream.prototype, t.toStringTag, { value: "TransformStream", configurable: true });
      class TransformStreamDefaultController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        get desiredSize() {
          if (!Wr(this))
            throw jr("desiredSize");
          return Gt(this._controlledTransformStream._readable._readableStreamController);
        }
        enqueue(e2) {
          if (!Wr(this))
            throw jr("enqueue");
          Br(this, e2);
        }
        error(e2) {
          if (!Wr(this))
            throw jr("error");
          var t2;
          t2 = e2, qr(this._controlledTransformStream, t2);
        }
        terminate() {
          if (!Wr(this))
            throw jr("terminate");
          !function(e2) {
            const t2 = e2._controlledTransformStream;
            Ht(t2._readable._readableStreamController);
            const r2 = new TypeError("TransformStream terminated");
            Pr(t2, r2);
          }(this);
        }
      }
      __name(TransformStreamDefaultController, "TransformStreamDefaultController");
      function Wr(e2) {
        return !!o(e2) && (!!Object.prototype.hasOwnProperty.call(e2, "_controlledTransformStream") && e2 instanceof TransformStreamDefaultController);
      }
      __name(Wr, "Wr");
      function Or(e2) {
        e2._transformAlgorithm = void 0, e2._flushAlgorithm = void 0;
      }
      __name(Or, "Or");
      function Br(e2, t2) {
        const r2 = e2._controlledTransformStream, o2 = r2._readable._readableStreamController;
        if (!Xt(o2))
          throw new TypeError("Readable side is not in a state that permits enqueue");
        try {
          Vt(o2, t2);
        } catch (e3) {
          throw Pr(r2, e3), r2._readable._storedError;
        }
        (function(e3) {
          return !xt(e3);
        })(o2) !== r2._backpressure && Er(r2, true);
      }
      __name(Br, "Br");
      function kr(e2, t2) {
        return m(e2._transformAlgorithm(t2), void 0, (t3) => {
          throw qr(e2._controlledTransformStream, t3), t3;
        });
      }
      __name(kr, "kr");
      function jr(e2) {
        return new TypeError(`TransformStreamDefaultController.prototype.${e2} can only be used on a TransformStreamDefaultController`);
      }
      __name(jr, "jr");
      function Ar(e2) {
        return new TypeError(`TransformStream.prototype.${e2} can only be used on a TransformStream`);
      }
      __name(Ar, "Ar");
      Object.defineProperties(TransformStreamDefaultController.prototype, { enqueue: { enumerable: true }, error: { enumerable: true }, terminate: { enumerable: true }, desiredSize: { enumerable: true } }), typeof t.toStringTag == "symbol" && Object.defineProperty(TransformStreamDefaultController.prototype, t.toStringTag, { value: "TransformStreamDefaultController", configurable: true }), e.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy, e.CountQueuingStrategy = CountQueuingStrategy, e.ReadableByteStreamController = ReadableByteStreamController, e.ReadableStream = ReadableStream, e.ReadableStreamBYOBReader = ReadableStreamBYOBReader, e.ReadableStreamBYOBRequest = ReadableStreamBYOBRequest, e.ReadableStreamDefaultController = ReadableStreamDefaultController, e.ReadableStreamDefaultReader = ReadableStreamDefaultReader, e.TransformStream = TransformStream, e.TransformStreamDefaultController = TransformStreamDefaultController, e.WritableStream = WritableStream, e.WritableStreamDefaultController = WritableStreamDefaultController, e.WritableStreamDefaultWriter = WritableStreamDefaultWriter, Object.defineProperty(e, "__esModule", { value: true });
    });
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/isFunction.js
var require_isFunction = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/isFunction.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isFunction = void 0;
    var isFunction = /* @__PURE__ */ __name((value) => typeof value === "function", "isFunction");
    exports.isFunction = isFunction;
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/blobHelpers.js
var require_blobHelpers = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/blobHelpers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.sliceBlob = exports.consumeBlobParts = void 0;
    var isFunction_1 = require_isFunction();
    var CHUNK_SIZE = 65536;
    async function* clonePart(part) {
      const end = part.byteOffset + part.byteLength;
      let position = part.byteOffset;
      while (position !== end) {
        const size = Math.min(end - position, CHUNK_SIZE);
        const chunk = part.buffer.slice(position, position + size);
        position += chunk.byteLength;
        yield new Uint8Array(chunk);
      }
    }
    __name(clonePart, "clonePart");
    async function* consumeNodeBlob(blob) {
      let position = 0;
      while (position !== blob.size) {
        const chunk = blob.slice(position, Math.min(blob.size, position + CHUNK_SIZE));
        const buffer = await chunk.arrayBuffer();
        position += buffer.byteLength;
        yield new Uint8Array(buffer);
      }
    }
    __name(consumeNodeBlob, "consumeNodeBlob");
    async function* consumeBlobParts(parts, clone = false) {
      for (const part of parts) {
        if (ArrayBuffer.isView(part)) {
          if (clone) {
            yield* clonePart(part);
          } else {
            yield part;
          }
        } else if ((0, isFunction_1.isFunction)(part.stream)) {
          yield* part.stream();
        } else {
          yield* consumeNodeBlob(part);
        }
      }
    }
    __name(consumeBlobParts, "consumeBlobParts");
    exports.consumeBlobParts = consumeBlobParts;
    function* sliceBlob(blobParts, blobSize, start = 0, end) {
      end !== null && end !== void 0 ? end : end = blobSize;
      let relativeStart = start < 0 ? Math.max(blobSize + start, 0) : Math.min(start, blobSize);
      let relativeEnd = end < 0 ? Math.max(blobSize + end, 0) : Math.min(end, blobSize);
      const span = Math.max(relativeEnd - relativeStart, 0);
      let added = 0;
      for (const part of blobParts) {
        if (added >= span) {
          break;
        }
        const partSize = ArrayBuffer.isView(part) ? part.byteLength : part.size;
        if (relativeStart && partSize <= relativeStart) {
          relativeStart -= partSize;
          relativeEnd -= partSize;
        } else {
          let chunk;
          if (ArrayBuffer.isView(part)) {
            chunk = part.subarray(relativeStart, Math.min(partSize, relativeEnd));
            added += chunk.byteLength;
          } else {
            chunk = part.slice(relativeStart, Math.min(partSize, relativeEnd));
            added += chunk.size;
          }
          relativeEnd -= partSize;
          relativeStart = 0;
          yield chunk;
        }
      }
    }
    __name(sliceBlob, "sliceBlob");
    exports.sliceBlob = sliceBlob;
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/Blob.js
var require_Blob = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/Blob.js"(exports) {
    "use strict";
    var __classPrivateFieldGet2 = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
        throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var __classPrivateFieldSet2 = exports && exports.__classPrivateFieldSet || function(receiver, state, value, kind, f) {
      if (kind === "m")
        throw new TypeError("Private method is not writable");
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a setter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
        throw new TypeError("Cannot write private member to an object whose class did not declare it");
      return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
    };
    var _Blob_parts;
    var _Blob_type;
    var _Blob_size;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Blob = void 0;
    var web_streams_polyfill_1 = require_ponyfill();
    var isFunction_1 = require_isFunction();
    var blobHelpers_1 = require_blobHelpers();
    var Blob = class {
      constructor(blobParts = [], options = {}) {
        _Blob_parts.set(this, []);
        _Blob_type.set(this, "");
        _Blob_size.set(this, 0);
        options !== null && options !== void 0 ? options : options = {};
        if (typeof blobParts !== "object" || blobParts === null) {
          throw new TypeError("Failed to construct 'Blob': The provided value cannot be converted to a sequence.");
        }
        if (!(0, isFunction_1.isFunction)(blobParts[Symbol.iterator])) {
          throw new TypeError("Failed to construct 'Blob': The object must have a callable @@iterator property.");
        }
        if (typeof options !== "object" && !(0, isFunction_1.isFunction)(options)) {
          throw new TypeError("Failed to construct 'Blob': parameter 2 cannot convert to dictionary.");
        }
        const encoder = new TextEncoder();
        for (const raw of blobParts) {
          let part;
          if (ArrayBuffer.isView(raw)) {
            part = new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
          } else if (raw instanceof ArrayBuffer) {
            part = new Uint8Array(raw.slice(0));
          } else if (raw instanceof Blob) {
            part = raw;
          } else {
            part = encoder.encode(String(raw));
          }
          __classPrivateFieldSet2(this, _Blob_size, __classPrivateFieldGet2(this, _Blob_size, "f") + (ArrayBuffer.isView(part) ? part.byteLength : part.size), "f");
          __classPrivateFieldGet2(this, _Blob_parts, "f").push(part);
        }
        const type = options.type === void 0 ? "" : String(options.type);
        __classPrivateFieldSet2(this, _Blob_type, /^[\x20-\x7E]*$/.test(type) ? type : "", "f");
      }
      static [(_Blob_parts = /* @__PURE__ */ new WeakMap(), _Blob_type = /* @__PURE__ */ new WeakMap(), _Blob_size = /* @__PURE__ */ new WeakMap(), Symbol.hasInstance)](value) {
        return Boolean(value && typeof value === "object" && (0, isFunction_1.isFunction)(value.constructor) && ((0, isFunction_1.isFunction)(value.stream) || (0, isFunction_1.isFunction)(value.arrayBuffer)) && /^(Blob|File)$/.test(value[Symbol.toStringTag]));
      }
      get type() {
        return __classPrivateFieldGet2(this, _Blob_type, "f");
      }
      get size() {
        return __classPrivateFieldGet2(this, _Blob_size, "f");
      }
      slice(start, end, contentType) {
        return new Blob((0, blobHelpers_1.sliceBlob)(__classPrivateFieldGet2(this, _Blob_parts, "f"), this.size, start, end), {
          type: contentType
        });
      }
      async text() {
        const decoder = new TextDecoder();
        let result = "";
        for await (const chunk of (0, blobHelpers_1.consumeBlobParts)(__classPrivateFieldGet2(this, _Blob_parts, "f"))) {
          result += decoder.decode(chunk, { stream: true });
        }
        result += decoder.decode();
        return result;
      }
      async arrayBuffer() {
        const view = new Uint8Array(this.size);
        let offset = 0;
        for await (const chunk of (0, blobHelpers_1.consumeBlobParts)(__classPrivateFieldGet2(this, _Blob_parts, "f"))) {
          view.set(chunk, offset);
          offset += chunk.length;
        }
        return view.buffer;
      }
      stream() {
        const iterator = (0, blobHelpers_1.consumeBlobParts)(__classPrivateFieldGet2(this, _Blob_parts, "f"), true);
        return new web_streams_polyfill_1.ReadableStream({
          async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) {
              return queueMicrotask(() => controller.close());
            }
            controller.enqueue(value);
          },
          async cancel() {
            await iterator.return();
          }
        });
      }
      get [Symbol.toStringTag]() {
        return "Blob";
      }
    };
    __name(Blob, "Blob");
    exports.Blob = Blob;
    Object.defineProperties(Blob.prototype, {
      type: { enumerable: true },
      size: { enumerable: true },
      slice: { enumerable: true },
      stream: { enumerable: true },
      text: { enumerable: true },
      arrayBuffer: { enumerable: true }
    });
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/File.js
var require_File = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/File.js"(exports) {
    "use strict";
    var __classPrivateFieldSet2 = exports && exports.__classPrivateFieldSet || function(receiver, state, value, kind, f) {
      if (kind === "m")
        throw new TypeError("Private method is not writable");
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a setter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
        throw new TypeError("Cannot write private member to an object whose class did not declare it");
      return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
    };
    var __classPrivateFieldGet2 = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
        throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _File_name;
    var _File_lastModified;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.File = void 0;
    var Blob_1 = require_Blob();
    var File = class extends Blob_1.Blob {
      constructor(fileBits, name, options = {}) {
        super(fileBits, options);
        _File_name.set(this, void 0);
        _File_lastModified.set(this, 0);
        if (arguments.length < 2) {
          throw new TypeError(`Failed to construct 'File': 2 arguments required, but only ${arguments.length} present.`);
        }
        __classPrivateFieldSet2(this, _File_name, String(name), "f");
        const lastModified = options.lastModified === void 0 ? Date.now() : Number(options.lastModified);
        if (!Number.isNaN(lastModified)) {
          __classPrivateFieldSet2(this, _File_lastModified, lastModified, "f");
        }
      }
      get name() {
        return __classPrivateFieldGet2(this, _File_name, "f");
      }
      get lastModified() {
        return __classPrivateFieldGet2(this, _File_lastModified, "f");
      }
      get [(_File_name = /* @__PURE__ */ new WeakMap(), _File_lastModified = /* @__PURE__ */ new WeakMap(), Symbol.toStringTag)]() {
        return "File";
      }
    };
    __name(File, "File");
    exports.File = File;
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/isFile.js
var require_isFile = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/isFile.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isFile = void 0;
    var File_1 = require_File();
    var isFile = /* @__PURE__ */ __name((value) => value instanceof File_1.File, "isFile");
    exports.isFile = isFile;
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/deprecateConstructorEntries.js
var require_deprecateConstructorEntries = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/deprecateConstructorEntries.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.deprecateConstructorEntries = void 0;
    var util_1 = require("util");
    exports.deprecateConstructorEntries = (0, util_1.deprecate)(() => {
    }, 'Constructor "entries" argument is not spec-compliant and will be removed in next major release.');
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/FormData.js
var require_FormData = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/FormData.js"(exports) {
    "use strict";
    var __classPrivateFieldGet2 = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
        throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _FormData_instances;
    var _FormData_entries;
    var _FormData_setEntry;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FormData = void 0;
    var util_1 = require("util");
    var File_1 = require_File();
    var isFile_1 = require_isFile();
    var isFunction_1 = require_isFunction();
    var deprecateConstructorEntries_1 = require_deprecateConstructorEntries();
    var FormData = class {
      constructor(entries) {
        _FormData_instances.add(this);
        _FormData_entries.set(this, /* @__PURE__ */ new Map());
        if (entries) {
          (0, deprecateConstructorEntries_1.deprecateConstructorEntries)();
          entries.forEach(({ name, value, fileName }) => this.append(name, value, fileName));
        }
      }
      static [(_FormData_entries = /* @__PURE__ */ new WeakMap(), _FormData_instances = /* @__PURE__ */ new WeakSet(), Symbol.hasInstance)](value) {
        return Boolean(value && (0, isFunction_1.isFunction)(value.constructor) && value[Symbol.toStringTag] === "FormData" && (0, isFunction_1.isFunction)(value.append) && (0, isFunction_1.isFunction)(value.set) && (0, isFunction_1.isFunction)(value.get) && (0, isFunction_1.isFunction)(value.getAll) && (0, isFunction_1.isFunction)(value.has) && (0, isFunction_1.isFunction)(value.delete) && (0, isFunction_1.isFunction)(value.entries) && (0, isFunction_1.isFunction)(value.values) && (0, isFunction_1.isFunction)(value.keys) && (0, isFunction_1.isFunction)(value[Symbol.iterator]) && (0, isFunction_1.isFunction)(value.forEach));
      }
      append(name, value, fileName) {
        __classPrivateFieldGet2(this, _FormData_instances, "m", _FormData_setEntry).call(this, {
          name,
          fileName,
          append: true,
          rawValue: value,
          argsLength: arguments.length
        });
      }
      set(name, value, fileName) {
        __classPrivateFieldGet2(this, _FormData_instances, "m", _FormData_setEntry).call(this, {
          name,
          fileName,
          append: false,
          rawValue: value,
          argsLength: arguments.length
        });
      }
      get(name) {
        const field = __classPrivateFieldGet2(this, _FormData_entries, "f").get(String(name));
        if (!field) {
          return null;
        }
        return field[0];
      }
      getAll(name) {
        const field = __classPrivateFieldGet2(this, _FormData_entries, "f").get(String(name));
        if (!field) {
          return [];
        }
        return field.slice();
      }
      has(name) {
        return __classPrivateFieldGet2(this, _FormData_entries, "f").has(String(name));
      }
      delete(name) {
        __classPrivateFieldGet2(this, _FormData_entries, "f").delete(String(name));
      }
      *keys() {
        for (const key of __classPrivateFieldGet2(this, _FormData_entries, "f").keys()) {
          yield key;
        }
      }
      *entries() {
        for (const name of this.keys()) {
          const values = this.getAll(name);
          for (const value of values) {
            yield [name, value];
          }
        }
      }
      *values() {
        for (const [, value] of this) {
          yield value;
        }
      }
      [(_FormData_setEntry = /* @__PURE__ */ __name(function _FormData_setEntry2({ name, rawValue, append, fileName, argsLength }) {
        const methodName = append ? "append" : "set";
        if (argsLength < 2) {
          throw new TypeError(`Failed to execute '${methodName}' on 'FormData': 2 arguments required, but only ${argsLength} present.`);
        }
        name = String(name);
        let value;
        if ((0, isFile_1.isFile)(rawValue)) {
          if (fileName === void 0) {
            fileName = rawValue.name === void 0 ? "blob" : rawValue.name;
          }
          value = new File_1.File([rawValue], String(fileName), {
            type: rawValue.type,
            lastModified: rawValue.lastModified
          });
        } else if (fileName) {
          throw new TypeError(`Failed to execute '${methodName}' on 'FormData': parameter 2 is not of type 'Blob'.`);
        } else {
          value = String(rawValue);
        }
        const values = __classPrivateFieldGet2(this, _FormData_entries, "f").get(name);
        if (!values) {
          return void __classPrivateFieldGet2(this, _FormData_entries, "f").set(name, [value]);
        }
        if (!append) {
          return void __classPrivateFieldGet2(this, _FormData_entries, "f").set(name, [value]);
        }
        values.push(value);
      }, "_FormData_setEntry"), Symbol.iterator)]() {
        return this.entries();
      }
      forEach(callback, thisArg) {
        for (const [name, value] of this) {
          callback.call(thisArg, value, name, this);
        }
      }
      get [Symbol.toStringTag]() {
        return "FormData";
      }
      [util_1.inspect.custom]() {
        return this[Symbol.toStringTag];
      }
    };
    __name(FormData, "FormData");
    exports.FormData = FormData;
  }
});

// ../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/index.js
var require_cjs2 = __commonJS({
  "../../node_modules/.pnpm/formdata-node@4.3.3/node_modules/formdata-node/lib/cjs/index.js"(exports) {
    "use strict";
    var __createBinding2 = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      Object.defineProperty(o, k2, { enumerable: true, get: function() {
        return m[k];
      } });
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __exportStar2 = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m)
        if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p))
          __createBinding2(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar2(require_FormData(), exports);
    __exportStar2(require_Blob(), exports);
    __exportStar2(require_File(), exports);
  }
});

// src/polyfills/buffer.js
var require_buffer = __commonJS({
  "src/polyfills/buffer.js"(exports, module2) {
    "use strict";
    var buffer = require_buffer();
    buffer.Blob = require_cjs2().Blob;
    module2.exports = buffer;
  }
});

// ../../node_modules/.pnpm/pvtsutils@1.3.2/node_modules/pvtsutils/build/index.es.js
function combine(...buf) {
  const totalByteLength = buf.map((item) => item.byteLength).reduce((prev, cur) => prev + cur);
  const res = new Uint8Array(totalByteLength);
  let currentPos = 0;
  buf.map((item) => new Uint8Array(item)).forEach((arr) => {
    for (const item2 of arr) {
      res[currentPos++] = item2;
    }
  });
  return res.buffer;
}
var ARRAY_BUFFER_NAME, BufferSourceConverter, Utf8Converter, Utf16Converter, Convert;
var init_index_es = __esm({
  "../../node_modules/.pnpm/pvtsutils@1.3.2/node_modules/pvtsutils/build/index.es.js"() {
    ARRAY_BUFFER_NAME = "[object ArrayBuffer]";
    BufferSourceConverter = class {
      static isArrayBuffer(data) {
        return Object.prototype.toString.call(data) === ARRAY_BUFFER_NAME;
      }
      static toArrayBuffer(data) {
        if (this.isArrayBuffer(data)) {
          return data;
        }
        if (data.byteLength === data.buffer.byteLength) {
          return data.buffer;
        }
        return this.toUint8Array(data).slice().buffer;
      }
      static toUint8Array(data) {
        return this.toView(data, Uint8Array);
      }
      static toView(data, type) {
        if (data.constructor === type) {
          return data;
        }
        if (this.isArrayBuffer(data)) {
          return new type(data);
        }
        if (this.isArrayBufferView(data)) {
          return new type(data.buffer, data.byteOffset, data.byteLength);
        }
        throw new TypeError("The provided value is not of type '(ArrayBuffer or ArrayBufferView)'");
      }
      static isBufferSource(data) {
        return this.isArrayBufferView(data) || this.isArrayBuffer(data);
      }
      static isArrayBufferView(data) {
        return ArrayBuffer.isView(data) || data && this.isArrayBuffer(data.buffer);
      }
      static isEqual(a, b) {
        const aView = BufferSourceConverter.toUint8Array(a);
        const bView = BufferSourceConverter.toUint8Array(b);
        if (aView.length !== bView.byteLength) {
          return false;
        }
        for (let i = 0; i < aView.length; i++) {
          if (aView[i] !== bView[i]) {
            return false;
          }
        }
        return true;
      }
      static concat(...args) {
        if (Array.isArray(args[0])) {
          const buffers = args[0];
          let size = 0;
          for (const buffer of buffers) {
            size += buffer.byteLength;
          }
          const res = new Uint8Array(size);
          let offset = 0;
          for (const buffer of buffers) {
            const view = this.toUint8Array(buffer);
            res.set(view, offset);
            offset += view.length;
          }
          if (args[1]) {
            return this.toView(res, args[1]);
          }
          return res.buffer;
        } else {
          return this.concat(args);
        }
      }
    };
    __name(BufferSourceConverter, "BufferSourceConverter");
    Utf8Converter = class {
      static fromString(text) {
        const s = unescape(encodeURIComponent(text));
        const uintArray = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) {
          uintArray[i] = s.charCodeAt(i);
        }
        return uintArray.buffer;
      }
      static toString(buffer) {
        const buf = BufferSourceConverter.toUint8Array(buffer);
        let encodedString = "";
        for (let i = 0; i < buf.length; i++) {
          encodedString += String.fromCharCode(buf[i]);
        }
        const decodedString = decodeURIComponent(escape(encodedString));
        return decodedString;
      }
    };
    __name(Utf8Converter, "Utf8Converter");
    Utf16Converter = class {
      static toString(buffer, littleEndian = false) {
        const arrayBuffer = BufferSourceConverter.toArrayBuffer(buffer);
        const dataView = new DataView(arrayBuffer);
        let res = "";
        for (let i = 0; i < arrayBuffer.byteLength; i += 2) {
          const code = dataView.getUint16(i, littleEndian);
          res += String.fromCharCode(code);
        }
        return res;
      }
      static fromString(text, littleEndian = false) {
        const res = new ArrayBuffer(text.length * 2);
        const dataView = new DataView(res);
        for (let i = 0; i < text.length; i++) {
          dataView.setUint16(i * 2, text.charCodeAt(i), littleEndian);
        }
        return res;
      }
    };
    __name(Utf16Converter, "Utf16Converter");
    Convert = class {
      static isHex(data) {
        return typeof data === "string" && /^[a-z0-9]+$/i.test(data);
      }
      static isBase64(data) {
        return typeof data === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data);
      }
      static isBase64Url(data) {
        return typeof data === "string" && /^[a-zA-Z0-9-_]+$/i.test(data);
      }
      static ToString(buffer, enc = "utf8") {
        const buf = BufferSourceConverter.toUint8Array(buffer);
        switch (enc.toLowerCase()) {
          case "utf8":
            return this.ToUtf8String(buf);
          case "binary":
            return this.ToBinary(buf);
          case "hex":
            return this.ToHex(buf);
          case "base64":
            return this.ToBase64(buf);
          case "base64url":
            return this.ToBase64Url(buf);
          case "utf16le":
            return Utf16Converter.toString(buf, true);
          case "utf16":
          case "utf16be":
            return Utf16Converter.toString(buf);
          default:
            throw new Error(`Unknown type of encoding '${enc}'`);
        }
      }
      static FromString(str, enc = "utf8") {
        if (!str) {
          return new ArrayBuffer(0);
        }
        switch (enc.toLowerCase()) {
          case "utf8":
            return this.FromUtf8String(str);
          case "binary":
            return this.FromBinary(str);
          case "hex":
            return this.FromHex(str);
          case "base64":
            return this.FromBase64(str);
          case "base64url":
            return this.FromBase64Url(str);
          case "utf16le":
            return Utf16Converter.fromString(str, true);
          case "utf16":
          case "utf16be":
            return Utf16Converter.fromString(str);
          default:
            throw new Error(`Unknown type of encoding '${enc}'`);
        }
      }
      static ToBase64(buffer) {
        const buf = BufferSourceConverter.toUint8Array(buffer);
        if (typeof btoa !== "undefined") {
          const binary = this.ToString(buf, "binary");
          return btoa(binary);
        } else {
          return Buffer.from(buf).toString("base64");
        }
      }
      static FromBase64(base64) {
        const formatted = this.formatString(base64);
        if (!formatted) {
          return new ArrayBuffer(0);
        }
        if (!Convert.isBase64(formatted)) {
          throw new TypeError("Argument 'base64Text' is not Base64 encoded");
        }
        if (typeof atob !== "undefined") {
          return this.FromBinary(atob(formatted));
        } else {
          return new Uint8Array(Buffer.from(formatted, "base64")).buffer;
        }
      }
      static FromBase64Url(base64url) {
        const formatted = this.formatString(base64url);
        if (!formatted) {
          return new ArrayBuffer(0);
        }
        if (!Convert.isBase64Url(formatted)) {
          throw new TypeError("Argument 'base64url' is not Base64Url encoded");
        }
        return this.FromBase64(this.Base64Padding(formatted.replace(/\-/g, "+").replace(/\_/g, "/")));
      }
      static ToBase64Url(data) {
        return this.ToBase64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/\=/g, "");
      }
      static FromUtf8String(text, encoding = Convert.DEFAULT_UTF8_ENCODING) {
        switch (encoding) {
          case "ascii":
            return this.FromBinary(text);
          case "utf8":
            return Utf8Converter.fromString(text);
          case "utf16":
          case "utf16be":
            return Utf16Converter.fromString(text);
          case "utf16le":
          case "usc2":
            return Utf16Converter.fromString(text, true);
          default:
            throw new Error(`Unknown type of encoding '${encoding}'`);
        }
      }
      static ToUtf8String(buffer, encoding = Convert.DEFAULT_UTF8_ENCODING) {
        switch (encoding) {
          case "ascii":
            return this.ToBinary(buffer);
          case "utf8":
            return Utf8Converter.toString(buffer);
          case "utf16":
          case "utf16be":
            return Utf16Converter.toString(buffer);
          case "utf16le":
          case "usc2":
            return Utf16Converter.toString(buffer, true);
          default:
            throw new Error(`Unknown type of encoding '${encoding}'`);
        }
      }
      static FromBinary(text) {
        const stringLength = text.length;
        const resultView = new Uint8Array(stringLength);
        for (let i = 0; i < stringLength; i++) {
          resultView[i] = text.charCodeAt(i);
        }
        return resultView.buffer;
      }
      static ToBinary(buffer) {
        const buf = BufferSourceConverter.toUint8Array(buffer);
        let res = "";
        for (let i = 0; i < buf.length; i++) {
          res += String.fromCharCode(buf[i]);
        }
        return res;
      }
      static ToHex(buffer) {
        const buf = BufferSourceConverter.toUint8Array(buffer);
        const splitter = "";
        const res = [];
        const len = buf.length;
        for (let i = 0; i < len; i++) {
          const char = buf[i].toString(16).padStart(2, "0");
          res.push(char);
        }
        return res.join(splitter);
      }
      static FromHex(hexString) {
        let formatted = this.formatString(hexString);
        if (!formatted) {
          return new ArrayBuffer(0);
        }
        if (!Convert.isHex(formatted)) {
          throw new TypeError("Argument 'hexString' is not HEX encoded");
        }
        if (formatted.length % 2) {
          formatted = `0${formatted}`;
        }
        const res = new Uint8Array(formatted.length / 2);
        for (let i = 0; i < formatted.length; i = i + 2) {
          const c = formatted.slice(i, i + 2);
          res[i / 2] = parseInt(c, 16);
        }
        return res.buffer;
      }
      static ToUtf16String(buffer, littleEndian = false) {
        return Utf16Converter.toString(buffer, littleEndian);
      }
      static FromUtf16String(text, littleEndian = false) {
        return Utf16Converter.fromString(text, littleEndian);
      }
      static Base64Padding(base64) {
        const padCount = 4 - base64.length % 4;
        if (padCount < 4) {
          for (let i = 0; i < padCount; i++) {
            base64 += "=";
          }
        }
        return base64;
      }
      static formatString(data) {
        return (data === null || data === void 0 ? void 0 : data.replace(/[\n\r\t ]/g, "")) || "";
      }
    };
    __name(Convert, "Convert");
    Convert.DEFAULT_UTF8_ENCODING = "utf8";
    __name(combine, "combine");
  }
});

// ../../node_modules/.pnpm/pvutils@1.1.3/node_modules/pvutils/build/utils.es.js
function utilFromBase(inputBuffer, inputBase) {
  let result = 0;
  if (inputBuffer.length === 1) {
    return inputBuffer[0];
  }
  for (let i = inputBuffer.length - 1; i >= 0; i--) {
    result += inputBuffer[inputBuffer.length - 1 - i] * Math.pow(2, inputBase * i);
  }
  return result;
}
function utilToBase(value, base, reserved = -1) {
  const internalReserved = reserved;
  let internalValue = value;
  let result = 0;
  let biggest = Math.pow(2, base);
  for (let i = 1; i < 8; i++) {
    if (value < biggest) {
      let retBuf;
      if (internalReserved < 0) {
        retBuf = new ArrayBuffer(i);
        result = i;
      } else {
        if (internalReserved < i) {
          return new ArrayBuffer(0);
        }
        retBuf = new ArrayBuffer(internalReserved);
        result = internalReserved;
      }
      const retView = new Uint8Array(retBuf);
      for (let j = i - 1; j >= 0; j--) {
        const basis = Math.pow(2, j * base);
        retView[result - j - 1] = Math.floor(internalValue / basis);
        internalValue -= retView[result - j - 1] * basis;
      }
      return retBuf;
    }
    biggest *= Math.pow(2, base);
  }
  return new ArrayBuffer(0);
}
function utilConcatView(...views) {
  let outputLength = 0;
  let prevLength = 0;
  for (const view of views) {
    outputLength += view.length;
  }
  const retBuf = new ArrayBuffer(outputLength);
  const retView = new Uint8Array(retBuf);
  for (const view of views) {
    retView.set(view, prevLength);
    prevLength += view.length;
  }
  return retView;
}
function utilDecodeTC() {
  const buf = new Uint8Array(this.valueHex);
  if (this.valueHex.byteLength >= 2) {
    const condition1 = buf[0] === 255 && buf[1] & 128;
    const condition2 = buf[0] === 0 && (buf[1] & 128) === 0;
    if (condition1 || condition2) {
      this.warnings.push("Needlessly long format");
    }
  }
  const bigIntBuffer = new ArrayBuffer(this.valueHex.byteLength);
  const bigIntView = new Uint8Array(bigIntBuffer);
  for (let i = 0; i < this.valueHex.byteLength; i++) {
    bigIntView[i] = 0;
  }
  bigIntView[0] = buf[0] & 128;
  const bigInt = utilFromBase(bigIntView, 8);
  const smallIntBuffer = new ArrayBuffer(this.valueHex.byteLength);
  const smallIntView = new Uint8Array(smallIntBuffer);
  for (let j = 0; j < this.valueHex.byteLength; j++) {
    smallIntView[j] = buf[j];
  }
  smallIntView[0] &= 127;
  const smallInt = utilFromBase(smallIntView, 8);
  return smallInt - bigInt;
}
function utilEncodeTC(value) {
  const modValue = value < 0 ? value * -1 : value;
  let bigInt = 128;
  for (let i = 1; i < 8; i++) {
    if (modValue <= bigInt) {
      if (value < 0) {
        const smallInt = bigInt - modValue;
        const retBuf2 = utilToBase(smallInt, 8, i);
        const retView2 = new Uint8Array(retBuf2);
        retView2[0] |= 128;
        return retBuf2;
      }
      let retBuf = utilToBase(modValue, 8, i);
      let retView = new Uint8Array(retBuf);
      if (retView[0] & 128) {
        const tempBuf = retBuf.slice(0);
        const tempView = new Uint8Array(tempBuf);
        retBuf = new ArrayBuffer(retBuf.byteLength + 1);
        retView = new Uint8Array(retBuf);
        for (let k = 0; k < tempBuf.byteLength; k++) {
          retView[k + 1] = tempView[k];
        }
        retView[0] = 0;
      }
      return retBuf;
    }
    bigInt *= Math.pow(2, 8);
  }
  return new ArrayBuffer(0);
}
function isEqualBuffer(inputBuffer1, inputBuffer2) {
  if (inputBuffer1.byteLength !== inputBuffer2.byteLength) {
    return false;
  }
  const view1 = new Uint8Array(inputBuffer1);
  const view2 = new Uint8Array(inputBuffer2);
  for (let i = 0; i < view1.length; i++) {
    if (view1[i] !== view2[i]) {
      return false;
    }
  }
  return true;
}
function padNumber(inputNumber, fullLength) {
  const str = inputNumber.toString(10);
  if (fullLength < str.length) {
    return "";
  }
  const dif = fullLength - str.length;
  const padding = new Array(dif);
  for (let i = 0; i < dif; i++) {
    padding[i] = "0";
  }
  const paddingString = padding.join("");
  return paddingString.concat(str);
}
var log2;
var init_utils_es = __esm({
  "../../node_modules/.pnpm/pvutils@1.1.3/node_modules/pvutils/build/utils.es.js"() {
    __name(utilFromBase, "utilFromBase");
    __name(utilToBase, "utilToBase");
    __name(utilConcatView, "utilConcatView");
    __name(utilDecodeTC, "utilDecodeTC");
    __name(utilEncodeTC, "utilEncodeTC");
    __name(isEqualBuffer, "isEqualBuffer");
    __name(padNumber, "padNumber");
    log2 = Math.log(2);
  }
});

// ../../node_modules/.pnpm/asn1js@3.0.5/node_modules/asn1js/build/index.es.js
var index_es_exports = {};
__export(index_es_exports, {
  Any: () => Any,
  BaseBlock: () => BaseBlock,
  BaseStringBlock: () => BaseStringBlock,
  BitString: () => BitString,
  BmpString: () => BmpString,
  Boolean: () => Boolean2,
  CharacterString: () => CharacterString,
  Choice: () => Choice,
  Constructed: () => Constructed,
  DATE: () => DATE,
  DateTime: () => DateTime,
  Duration: () => Duration,
  EndOfContent: () => EndOfContent,
  Enumerated: () => Enumerated,
  GeneralString: () => GeneralString,
  GeneralizedTime: () => GeneralizedTime,
  GraphicString: () => GraphicString,
  HexBlock: () => HexBlock,
  IA5String: () => IA5String,
  Integer: () => Integer,
  Null: () => Null,
  NumericString: () => NumericString,
  ObjectIdentifier: () => ObjectIdentifier,
  OctetString: () => OctetString,
  Primitive: () => Primitive,
  PrintableString: () => PrintableString,
  RawData: () => RawData,
  RelativeObjectIdentifier: () => RelativeObjectIdentifier,
  Repeated: () => Repeated,
  Sequence: () => Sequence,
  Set: () => Set2,
  TIME: () => TIME,
  TeletexString: () => TeletexString,
  TimeOfDay: () => TimeOfDay,
  UTCTime: () => UTCTime,
  UniversalString: () => UniversalString,
  Utf8String: () => Utf8String,
  ValueBlock: () => ValueBlock,
  VideotexString: () => VideotexString,
  ViewWriter: () => ViewWriter,
  VisibleString: () => VisibleString,
  compareSchema: () => compareSchema,
  fromBER: () => fromBER,
  verifySchema: () => verifySchema
});
function assertBigInt() {
  if (typeof BigInt === "undefined") {
    throw new Error("BigInt is not defined. Your environment doesn't implement BigInt.");
  }
}
function concat(buffers) {
  let outputLength = 0;
  let prevLength = 0;
  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    outputLength += buffer.byteLength;
  }
  const retView = new Uint8Array(outputLength);
  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    retView.set(new Uint8Array(buffer), prevLength);
    prevLength += buffer.byteLength;
  }
  return retView.buffer;
}
function checkBufferParams(baseBlock, inputBuffer, inputOffset, inputLength) {
  if (!(inputBuffer instanceof Uint8Array)) {
    baseBlock.error = "Wrong parameter: inputBuffer must be 'Uint8Array'";
    return false;
  }
  if (!inputBuffer.byteLength) {
    baseBlock.error = "Wrong parameter: inputBuffer has zero length";
    return false;
  }
  if (inputOffset < 0) {
    baseBlock.error = "Wrong parameter: inputOffset less than zero";
    return false;
  }
  if (inputLength < 0) {
    baseBlock.error = "Wrong parameter: inputLength less than zero";
    return false;
  }
  if (inputBuffer.byteLength - inputOffset - inputLength < 0) {
    baseBlock.error = "End of input reached before message was fully decoded (inconsistent offset and length values)";
    return false;
  }
  return true;
}
function HexBlock(BaseClass) {
  var _a2;
  return _a2 = /* @__PURE__ */ __name(class Some extends BaseClass {
    constructor(...args) {
      var _a3;
      super(...args);
      const params = args[0] || {};
      this.isHexOnly = (_a3 = params.isHexOnly) !== null && _a3 !== void 0 ? _a3 : false;
      this.valueHexView = params.valueHex ? BufferSourceConverter.toUint8Array(params.valueHex) : EMPTY_VIEW;
    }
    get valueHex() {
      return this.valueHexView.slice().buffer;
    }
    set valueHex(value) {
      this.valueHexView = new Uint8Array(value);
    }
    fromBER(inputBuffer, inputOffset, inputLength) {
      const view = inputBuffer instanceof ArrayBuffer ? new Uint8Array(inputBuffer) : inputBuffer;
      if (!checkBufferParams(this, view, inputOffset, inputLength)) {
        return -1;
      }
      const endLength = inputOffset + inputLength;
      this.valueHexView = view.subarray(inputOffset, endLength);
      if (!this.valueHexView.length) {
        this.warnings.push("Zero buffer length");
        return inputOffset;
      }
      this.blockLength = inputLength;
      return endLength;
    }
    toBER(sizeOnly = false) {
      if (!this.isHexOnly) {
        this.error = "Flag 'isHexOnly' is not set, abort";
        return EMPTY_BUFFER;
      }
      if (sizeOnly) {
        return new ArrayBuffer(this.valueHexView.byteLength);
      }
      return this.valueHexView.byteLength === this.valueHexView.buffer.byteLength ? this.valueHexView.buffer : this.valueHexView.slice().buffer;
    }
    toJSON() {
      return {
        ...super.toJSON(),
        isHexOnly: this.isHexOnly,
        valueHex: Convert.ToHex(this.valueHexView)
      };
    }
  }, "Some"), _a2.NAME = "hexBlock", _a2;
}
function prepareIndefiniteForm(baseBlock) {
  if (baseBlock instanceof typeStore.Constructed) {
    for (const value of baseBlock.valueBlock.value) {
      if (prepareIndefiniteForm(value)) {
        baseBlock.lenBlock.isIndefiniteForm = true;
      }
    }
  }
  return !!baseBlock.lenBlock.isIndefiniteForm;
}
function localChangeType(inputObject, newType) {
  if (inputObject instanceof newType) {
    return inputObject;
  }
  const newObject = new newType();
  newObject.idBlock = inputObject.idBlock;
  newObject.lenBlock = inputObject.lenBlock;
  newObject.warnings = inputObject.warnings;
  newObject.valueBeforeDecodeView = inputObject.valueBeforeDecodeView;
  return newObject;
}
function localFromBER(inputBuffer, inputOffset = 0, inputLength = inputBuffer.length) {
  const incomingOffset = inputOffset;
  let returnObject = new BaseBlock({}, ValueBlock);
  const baseBlock = new LocalBaseBlock();
  if (!checkBufferParams(baseBlock, inputBuffer, inputOffset, inputLength)) {
    returnObject.error = baseBlock.error;
    return {
      offset: -1,
      result: returnObject
    };
  }
  const intBuffer = inputBuffer.subarray(inputOffset, inputOffset + inputLength);
  if (!intBuffer.length) {
    returnObject.error = "Zero buffer length";
    return {
      offset: -1,
      result: returnObject
    };
  }
  let resultOffset = returnObject.idBlock.fromBER(inputBuffer, inputOffset, inputLength);
  if (returnObject.idBlock.warnings.length) {
    returnObject.warnings.concat(returnObject.idBlock.warnings);
  }
  if (resultOffset === -1) {
    returnObject.error = returnObject.idBlock.error;
    return {
      offset: -1,
      result: returnObject
    };
  }
  inputOffset = resultOffset;
  inputLength -= returnObject.idBlock.blockLength;
  resultOffset = returnObject.lenBlock.fromBER(inputBuffer, inputOffset, inputLength);
  if (returnObject.lenBlock.warnings.length) {
    returnObject.warnings.concat(returnObject.lenBlock.warnings);
  }
  if (resultOffset === -1) {
    returnObject.error = returnObject.lenBlock.error;
    return {
      offset: -1,
      result: returnObject
    };
  }
  inputOffset = resultOffset;
  inputLength -= returnObject.lenBlock.blockLength;
  if (!returnObject.idBlock.isConstructed && returnObject.lenBlock.isIndefiniteForm) {
    returnObject.error = "Indefinite length form used for primitive encoding form";
    return {
      offset: -1,
      result: returnObject
    };
  }
  let newASN1Type = BaseBlock;
  switch (returnObject.idBlock.tagClass) {
    case 1:
      if (returnObject.idBlock.tagNumber >= 37 && returnObject.idBlock.isHexOnly === false) {
        returnObject.error = "UNIVERSAL 37 and upper tags are reserved by ASN.1 standard";
        return {
          offset: -1,
          result: returnObject
        };
      }
      switch (returnObject.idBlock.tagNumber) {
        case 0:
          if (returnObject.idBlock.isConstructed && returnObject.lenBlock.length > 0) {
            returnObject.error = "Type [UNIVERSAL 0] is reserved";
            return {
              offset: -1,
              result: returnObject
            };
          }
          newASN1Type = typeStore.EndOfContent;
          break;
        case 1:
          newASN1Type = typeStore.Boolean;
          break;
        case 2:
          newASN1Type = typeStore.Integer;
          break;
        case 3:
          newASN1Type = typeStore.BitString;
          break;
        case 4:
          newASN1Type = typeStore.OctetString;
          break;
        case 5:
          newASN1Type = typeStore.Null;
          break;
        case 6:
          newASN1Type = typeStore.ObjectIdentifier;
          break;
        case 10:
          newASN1Type = typeStore.Enumerated;
          break;
        case 12:
          newASN1Type = typeStore.Utf8String;
          break;
        case 13:
          newASN1Type = typeStore.RelativeObjectIdentifier;
          break;
        case 14:
          newASN1Type = typeStore.TIME;
          break;
        case 15:
          returnObject.error = "[UNIVERSAL 15] is reserved by ASN.1 standard";
          return {
            offset: -1,
            result: returnObject
          };
        case 16:
          newASN1Type = typeStore.Sequence;
          break;
        case 17:
          newASN1Type = typeStore.Set;
          break;
        case 18:
          newASN1Type = typeStore.NumericString;
          break;
        case 19:
          newASN1Type = typeStore.PrintableString;
          break;
        case 20:
          newASN1Type = typeStore.TeletexString;
          break;
        case 21:
          newASN1Type = typeStore.VideotexString;
          break;
        case 22:
          newASN1Type = typeStore.IA5String;
          break;
        case 23:
          newASN1Type = typeStore.UTCTime;
          break;
        case 24:
          newASN1Type = typeStore.GeneralizedTime;
          break;
        case 25:
          newASN1Type = typeStore.GraphicString;
          break;
        case 26:
          newASN1Type = typeStore.VisibleString;
          break;
        case 27:
          newASN1Type = typeStore.GeneralString;
          break;
        case 28:
          newASN1Type = typeStore.UniversalString;
          break;
        case 29:
          newASN1Type = typeStore.CharacterString;
          break;
        case 30:
          newASN1Type = typeStore.BmpString;
          break;
        case 31:
          newASN1Type = typeStore.DATE;
          break;
        case 32:
          newASN1Type = typeStore.TimeOfDay;
          break;
        case 33:
          newASN1Type = typeStore.DateTime;
          break;
        case 34:
          newASN1Type = typeStore.Duration;
          break;
        default: {
          const newObject = returnObject.idBlock.isConstructed ? new typeStore.Constructed() : new typeStore.Primitive();
          newObject.idBlock = returnObject.idBlock;
          newObject.lenBlock = returnObject.lenBlock;
          newObject.warnings = returnObject.warnings;
          returnObject = newObject;
        }
      }
      break;
    case 2:
    case 3:
    case 4:
    default: {
      newASN1Type = returnObject.idBlock.isConstructed ? typeStore.Constructed : typeStore.Primitive;
    }
  }
  returnObject = localChangeType(returnObject, newASN1Type);
  resultOffset = returnObject.fromBER(inputBuffer, inputOffset, returnObject.lenBlock.isIndefiniteForm ? inputLength : returnObject.lenBlock.length);
  returnObject.valueBeforeDecodeView = inputBuffer.subarray(incomingOffset, incomingOffset + returnObject.blockLength);
  return {
    offset: resultOffset,
    result: returnObject
  };
}
function fromBER(inputBuffer) {
  if (!inputBuffer.byteLength) {
    const result = new BaseBlock({}, ValueBlock);
    result.error = "Input buffer has zero length";
    return {
      offset: -1,
      result
    };
  }
  return localFromBER(BufferSourceConverter.toUint8Array(inputBuffer).slice(), 0, inputBuffer.byteLength);
}
function checkLen(indefiniteLength, length) {
  if (indefiniteLength) {
    return 1;
  }
  return length;
}
function viewAdd(first, second) {
  const c = new Uint8Array([0]);
  const firstView = new Uint8Array(first);
  const secondView = new Uint8Array(second);
  let firstViewCopy = firstView.slice(0);
  const firstViewCopyLength = firstViewCopy.length - 1;
  const secondViewCopy = secondView.slice(0);
  const secondViewCopyLength = secondViewCopy.length - 1;
  let value = 0;
  const max = secondViewCopyLength < firstViewCopyLength ? firstViewCopyLength : secondViewCopyLength;
  let counter = 0;
  for (let i = max; i >= 0; i--, counter++) {
    switch (true) {
      case counter < secondViewCopy.length:
        value = firstViewCopy[firstViewCopyLength - counter] + secondViewCopy[secondViewCopyLength - counter] + c[0];
        break;
      default:
        value = firstViewCopy[firstViewCopyLength - counter] + c[0];
    }
    c[0] = value / 10;
    switch (true) {
      case counter >= firstViewCopy.length:
        firstViewCopy = utilConcatView(new Uint8Array([value % 10]), firstViewCopy);
        break;
      default:
        firstViewCopy[firstViewCopyLength - counter] = value % 10;
    }
  }
  if (c[0] > 0)
    firstViewCopy = utilConcatView(c, firstViewCopy);
  return firstViewCopy;
}
function power2(n) {
  if (n >= powers2.length) {
    for (let p = powers2.length; p <= n; p++) {
      const c = new Uint8Array([0]);
      let digits = powers2[p - 1].slice(0);
      for (let i = digits.length - 1; i >= 0; i--) {
        const newValue = new Uint8Array([(digits[i] << 1) + c[0]]);
        c[0] = newValue[0] / 10;
        digits[i] = newValue[0] % 10;
      }
      if (c[0] > 0)
        digits = utilConcatView(c, digits);
      powers2.push(digits);
    }
  }
  return powers2[n];
}
function viewSub(first, second) {
  let b = 0;
  const firstView = new Uint8Array(first);
  const secondView = new Uint8Array(second);
  const firstViewCopy = firstView.slice(0);
  const firstViewCopyLength = firstViewCopy.length - 1;
  const secondViewCopy = secondView.slice(0);
  const secondViewCopyLength = secondViewCopy.length - 1;
  let value;
  let counter = 0;
  for (let i = secondViewCopyLength; i >= 0; i--, counter++) {
    value = firstViewCopy[firstViewCopyLength - counter] - secondViewCopy[secondViewCopyLength - counter] - b;
    switch (true) {
      case value < 0:
        b = 1;
        firstViewCopy[firstViewCopyLength - counter] = value + 10;
        break;
      default:
        b = 0;
        firstViewCopy[firstViewCopyLength - counter] = value;
    }
  }
  if (b > 0) {
    for (let i = firstViewCopyLength - secondViewCopyLength + 1; i >= 0; i--, counter++) {
      value = firstViewCopy[firstViewCopyLength - counter] - b;
      if (value < 0) {
        b = 1;
        firstViewCopy[firstViewCopyLength - counter] = value + 10;
      } else {
        b = 0;
        firstViewCopy[firstViewCopyLength - counter] = value;
        break;
      }
    }
  }
  return firstViewCopy.slice();
}
function compareSchema(root, inputData, inputSchema) {
  if (inputSchema instanceof Choice) {
    for (let j = 0; j < inputSchema.value.length; j++) {
      const result = compareSchema(root, inputData, inputSchema.value[j]);
      if (result.verified) {
        return {
          verified: true,
          result: root
        };
      }
    }
    {
      const _result = {
        verified: false,
        result: {
          error: "Wrong values for Choice type"
        }
      };
      if (inputSchema.hasOwnProperty(NAME))
        _result.name = inputSchema.name;
      return _result;
    }
  }
  if (inputSchema instanceof Any) {
    if (inputSchema.hasOwnProperty(NAME))
      root[inputSchema.name] = inputData;
    return {
      verified: true,
      result: root
    };
  }
  if (root instanceof Object === false) {
    return {
      verified: false,
      result: { error: "Wrong root object" }
    };
  }
  if (inputData instanceof Object === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 data" }
    };
  }
  if (inputSchema instanceof Object === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (ID_BLOCK in inputSchema === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (FROM_BER in inputSchema.idBlock === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (TO_BER in inputSchema.idBlock === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  const encodedId = inputSchema.idBlock.toBER(false);
  if (encodedId.byteLength === 0) {
    return {
      verified: false,
      result: { error: "Error encoding idBlock for ASN.1 schema" }
    };
  }
  const decodedOffset = inputSchema.idBlock.fromBER(encodedId, 0, encodedId.byteLength);
  if (decodedOffset === -1) {
    return {
      verified: false,
      result: { error: "Error decoding idBlock for ASN.1 schema" }
    };
  }
  if (inputSchema.idBlock.hasOwnProperty(TAG_CLASS) === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (inputSchema.idBlock.tagClass !== inputData.idBlock.tagClass) {
    return {
      verified: false,
      result: root
    };
  }
  if (inputSchema.idBlock.hasOwnProperty(TAG_NUMBER) === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (inputSchema.idBlock.tagNumber !== inputData.idBlock.tagNumber) {
    return {
      verified: false,
      result: root
    };
  }
  if (inputSchema.idBlock.hasOwnProperty(IS_CONSTRUCTED) === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (inputSchema.idBlock.isConstructed !== inputData.idBlock.isConstructed) {
    return {
      verified: false,
      result: root
    };
  }
  if (!(IS_HEX_ONLY in inputSchema.idBlock)) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema" }
    };
  }
  if (inputSchema.idBlock.isHexOnly !== inputData.idBlock.isHexOnly) {
    return {
      verified: false,
      result: root
    };
  }
  if (inputSchema.idBlock.isHexOnly) {
    if (VALUE_HEX_VIEW in inputSchema.idBlock === false) {
      return {
        verified: false,
        result: { error: "Wrong ASN.1 schema" }
      };
    }
    const schemaView = inputSchema.idBlock.valueHexView;
    const asn1View = inputData.idBlock.valueHexView;
    if (schemaView.length !== asn1View.length) {
      return {
        verified: false,
        result: root
      };
    }
    for (let i = 0; i < schemaView.length; i++) {
      if (schemaView[i] !== asn1View[1]) {
        return {
          verified: false,
          result: root
        };
      }
    }
  }
  if (inputSchema.name) {
    inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
    if (inputSchema.name)
      root[inputSchema.name] = inputData;
  }
  if (inputSchema instanceof typeStore.Constructed) {
    let admission = 0;
    let result = {
      verified: false,
      result: {
        error: "Unknown error"
      }
    };
    let maxLength = inputSchema.valueBlock.value.length;
    if (maxLength > 0) {
      if (inputSchema.valueBlock.value[0] instanceof Repeated) {
        maxLength = inputData.valueBlock.value.length;
      }
    }
    if (maxLength === 0) {
      return {
        verified: true,
        result: root
      };
    }
    if (inputData.valueBlock.value.length === 0 && inputSchema.valueBlock.value.length !== 0) {
      let _optional = true;
      for (let i = 0; i < inputSchema.valueBlock.value.length; i++)
        _optional = _optional && (inputSchema.valueBlock.value[i].optional || false);
      if (_optional) {
        return {
          verified: true,
          result: root
        };
      }
      if (inputSchema.name) {
        inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
        if (inputSchema.name)
          delete root[inputSchema.name];
      }
      root.error = "Inconsistent object length";
      return {
        verified: false,
        result: root
      };
    }
    for (let i = 0; i < maxLength; i++) {
      if (i - admission >= inputData.valueBlock.value.length) {
        if (inputSchema.valueBlock.value[i].optional === false) {
          const _result = {
            verified: false,
            result: root
          };
          root.error = "Inconsistent length between ASN.1 data and schema";
          if (inputSchema.name) {
            inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
            if (inputSchema.name) {
              delete root[inputSchema.name];
              _result.name = inputSchema.name;
            }
          }
          return _result;
        }
      } else {
        if (inputSchema.valueBlock.value[0] instanceof Repeated) {
          result = compareSchema(root, inputData.valueBlock.value[i], inputSchema.valueBlock.value[0].value);
          if (result.verified === false) {
            if (inputSchema.valueBlock.value[0].optional)
              admission++;
            else {
              if (inputSchema.name) {
                inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
                if (inputSchema.name)
                  delete root[inputSchema.name];
              }
              return result;
            }
          }
          if (NAME in inputSchema.valueBlock.value[0] && inputSchema.valueBlock.value[0].name.length > 0) {
            let arrayRoot = {};
            if (LOCAL in inputSchema.valueBlock.value[0] && inputSchema.valueBlock.value[0].local)
              arrayRoot = inputData;
            else
              arrayRoot = root;
            if (typeof arrayRoot[inputSchema.valueBlock.value[0].name] === "undefined")
              arrayRoot[inputSchema.valueBlock.value[0].name] = [];
            arrayRoot[inputSchema.valueBlock.value[0].name].push(inputData.valueBlock.value[i]);
          }
        } else {
          result = compareSchema(root, inputData.valueBlock.value[i - admission], inputSchema.valueBlock.value[i]);
          if (result.verified === false) {
            if (inputSchema.valueBlock.value[i].optional)
              admission++;
            else {
              if (inputSchema.name) {
                inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
                if (inputSchema.name)
                  delete root[inputSchema.name];
              }
              return result;
            }
          }
        }
      }
    }
    if (result.verified === false) {
      const _result = {
        verified: false,
        result: root
      };
      if (inputSchema.name) {
        inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
        if (inputSchema.name) {
          delete root[inputSchema.name];
          _result.name = inputSchema.name;
        }
      }
      return _result;
    }
    return {
      verified: true,
      result: root
    };
  }
  if (inputSchema.primitiveSchema && VALUE_HEX_VIEW in inputData.valueBlock) {
    const asn1 = localFromBER(inputData.valueBlock.valueHexView);
    if (asn1.offset === -1) {
      const _result = {
        verified: false,
        result: asn1.result
      };
      if (inputSchema.name) {
        inputSchema.name = inputSchema.name.replace(/^\s+|\s+$/g, EMPTY_STRING);
        if (inputSchema.name) {
          delete root[inputSchema.name];
          _result.name = inputSchema.name;
        }
      }
      return _result;
    }
    return compareSchema(root, asn1.result, inputSchema.primitiveSchema);
  }
  return {
    verified: true,
    result: root
  };
}
function verifySchema(inputBuffer, inputSchema) {
  if (inputSchema instanceof Object === false) {
    return {
      verified: false,
      result: { error: "Wrong ASN.1 schema type" }
    };
  }
  const asn1 = localFromBER(BufferSourceConverter.toUint8Array(inputBuffer));
  if (asn1.offset === -1) {
    return {
      verified: false,
      result: asn1.result
    };
  }
  return compareSchema(asn1.result, asn1.result, inputSchema);
}
var ViewWriter, powers2, digitsString, NAME, VALUE_HEX_VIEW, IS_HEX_ONLY, ID_BLOCK, TAG_CLASS, TAG_NUMBER, IS_CONSTRUCTED, FROM_BER, TO_BER, LOCAL, EMPTY_STRING, EMPTY_BUFFER, EMPTY_VIEW, END_OF_CONTENT_NAME, OCTET_STRING_NAME, BIT_STRING_NAME, LocalBaseBlock, ValueBlock, LocalIdentificationBlock, LocalLengthBlock, typeStore, BaseBlock, BaseStringBlock, LocalPrimitiveValueBlock, _a$w, Primitive, LocalConstructedValueBlock, _a$v, Constructed, LocalEndOfContentValueBlock, _a$u, EndOfContent, _a$t, Null, LocalBooleanValueBlock, _a$s, Boolean2, LocalOctetStringValueBlock, _a$r, OctetString, LocalBitStringValueBlock, _a$q, BitString, _a$p, LocalIntegerValueBlock, _a$o, Integer, _a$n, Enumerated, LocalSidValueBlock, LocalObjectIdentifierValueBlock, _a$m, ObjectIdentifier, LocalRelativeSidValueBlock, LocalRelativeObjectIdentifierValueBlock, _a$l, RelativeObjectIdentifier, _a$k, Sequence, _a$j, Set2, LocalStringValueBlock, LocalSimpleStringValueBlock, LocalSimpleStringBlock, LocalUtf8StringValueBlock, _a$i, Utf8String, LocalBmpStringValueBlock, _a$h, BmpString, LocalUniversalStringValueBlock, _a$g, UniversalString, _a$f, NumericString, _a$e, PrintableString, _a$d, TeletexString, _a$c, VideotexString, _a$b, IA5String, _a$a, GraphicString, _a$9, VisibleString, _a$8, GeneralString, _a$7, CharacterString, _a$6, UTCTime, _a$5, GeneralizedTime, _a$4, DATE, _a$3, TimeOfDay, _a$2, DateTime, _a$1, Duration, _a, TIME, Any, Choice, Repeated, RawData;
var init_index_es2 = __esm({
  "../../node_modules/.pnpm/asn1js@3.0.5/node_modules/asn1js/build/index.es.js"() {
    init_index_es();
    init_utils_es();
    __name(assertBigInt, "assertBigInt");
    __name(concat, "concat");
    __name(checkBufferParams, "checkBufferParams");
    ViewWriter = class {
      constructor() {
        this.items = [];
      }
      write(buf) {
        this.items.push(buf);
      }
      final() {
        return concat(this.items);
      }
    };
    __name(ViewWriter, "ViewWriter");
    powers2 = [new Uint8Array([1])];
    digitsString = "0123456789";
    NAME = "name";
    VALUE_HEX_VIEW = "valueHexView";
    IS_HEX_ONLY = "isHexOnly";
    ID_BLOCK = "idBlock";
    TAG_CLASS = "tagClass";
    TAG_NUMBER = "tagNumber";
    IS_CONSTRUCTED = "isConstructed";
    FROM_BER = "fromBER";
    TO_BER = "toBER";
    LOCAL = "local";
    EMPTY_STRING = "";
    EMPTY_BUFFER = new ArrayBuffer(0);
    EMPTY_VIEW = new Uint8Array(0);
    END_OF_CONTENT_NAME = "EndOfContent";
    OCTET_STRING_NAME = "OCTET STRING";
    BIT_STRING_NAME = "BIT STRING";
    __name(HexBlock, "HexBlock");
    LocalBaseBlock = class {
      constructor({ blockLength = 0, error = EMPTY_STRING, warnings = [], valueBeforeDecode = EMPTY_VIEW } = {}) {
        this.blockLength = blockLength;
        this.error = error;
        this.warnings = warnings;
        this.valueBeforeDecodeView = BufferSourceConverter.toUint8Array(valueBeforeDecode);
      }
      static blockName() {
        return this.NAME;
      }
      get valueBeforeDecode() {
        return this.valueBeforeDecodeView.slice().buffer;
      }
      set valueBeforeDecode(value) {
        this.valueBeforeDecodeView = new Uint8Array(value);
      }
      toJSON() {
        return {
          blockName: this.constructor.NAME,
          blockLength: this.blockLength,
          error: this.error,
          warnings: this.warnings,
          valueBeforeDecode: Convert.ToHex(this.valueBeforeDecodeView)
        };
      }
    };
    __name(LocalBaseBlock, "LocalBaseBlock");
    LocalBaseBlock.NAME = "baseBlock";
    ValueBlock = class extends LocalBaseBlock {
      fromBER(inputBuffer, inputOffset, inputLength) {
        throw TypeError("User need to make a specific function in a class which extends 'ValueBlock'");
      }
      toBER(sizeOnly, writer) {
        throw TypeError("User need to make a specific function in a class which extends 'ValueBlock'");
      }
    };
    __name(ValueBlock, "ValueBlock");
    ValueBlock.NAME = "valueBlock";
    LocalIdentificationBlock = class extends HexBlock(LocalBaseBlock) {
      constructor({ idBlock = {} } = {}) {
        var _a2, _b, _c, _d;
        super();
        if (idBlock) {
          this.isHexOnly = (_a2 = idBlock.isHexOnly) !== null && _a2 !== void 0 ? _a2 : false;
          this.valueHexView = idBlock.valueHex ? BufferSourceConverter.toUint8Array(idBlock.valueHex) : EMPTY_VIEW;
          this.tagClass = (_b = idBlock.tagClass) !== null && _b !== void 0 ? _b : -1;
          this.tagNumber = (_c = idBlock.tagNumber) !== null && _c !== void 0 ? _c : -1;
          this.isConstructed = (_d = idBlock.isConstructed) !== null && _d !== void 0 ? _d : false;
        } else {
          this.tagClass = -1;
          this.tagNumber = -1;
          this.isConstructed = false;
        }
      }
      toBER(sizeOnly = false) {
        let firstOctet = 0;
        switch (this.tagClass) {
          case 1:
            firstOctet |= 0;
            break;
          case 2:
            firstOctet |= 64;
            break;
          case 3:
            firstOctet |= 128;
            break;
          case 4:
            firstOctet |= 192;
            break;
          default:
            this.error = "Unknown tag class";
            return EMPTY_BUFFER;
        }
        if (this.isConstructed)
          firstOctet |= 32;
        if (this.tagNumber < 31 && !this.isHexOnly) {
          const retView2 = new Uint8Array(1);
          if (!sizeOnly) {
            let number = this.tagNumber;
            number &= 31;
            firstOctet |= number;
            retView2[0] = firstOctet;
          }
          return retView2.buffer;
        }
        if (!this.isHexOnly) {
          const encodedBuf = utilToBase(this.tagNumber, 7);
          const encodedView = new Uint8Array(encodedBuf);
          const size = encodedBuf.byteLength;
          const retView2 = new Uint8Array(size + 1);
          retView2[0] = firstOctet | 31;
          if (!sizeOnly) {
            for (let i = 0; i < size - 1; i++)
              retView2[i + 1] = encodedView[i] | 128;
            retView2[size] = encodedView[size - 1];
          }
          return retView2.buffer;
        }
        const retView = new Uint8Array(this.valueHexView.byteLength + 1);
        retView[0] = firstOctet | 31;
        if (!sizeOnly) {
          const curView = this.valueHexView;
          for (let i = 0; i < curView.length - 1; i++)
            retView[i + 1] = curView[i] | 128;
          retView[this.valueHexView.byteLength] = curView[curView.length - 1];
        }
        return retView.buffer;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const inputView = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, inputView, inputOffset, inputLength)) {
          return -1;
        }
        const intBuffer = inputView.subarray(inputOffset, inputOffset + inputLength);
        if (intBuffer.length === 0) {
          this.error = "Zero buffer length";
          return -1;
        }
        const tagClassMask = intBuffer[0] & 192;
        switch (tagClassMask) {
          case 0:
            this.tagClass = 1;
            break;
          case 64:
            this.tagClass = 2;
            break;
          case 128:
            this.tagClass = 3;
            break;
          case 192:
            this.tagClass = 4;
            break;
          default:
            this.error = "Unknown tag class";
            return -1;
        }
        this.isConstructed = (intBuffer[0] & 32) === 32;
        this.isHexOnly = false;
        const tagNumberMask = intBuffer[0] & 31;
        if (tagNumberMask !== 31) {
          this.tagNumber = tagNumberMask;
          this.blockLength = 1;
        } else {
          let count = 1;
          let intTagNumberBuffer = this.valueHexView = new Uint8Array(255);
          let tagNumberBufferMaxLength = 255;
          while (intBuffer[count] & 128) {
            intTagNumberBuffer[count - 1] = intBuffer[count] & 127;
            count++;
            if (count >= intBuffer.length) {
              this.error = "End of input reached before message was fully decoded";
              return -1;
            }
            if (count === tagNumberBufferMaxLength) {
              tagNumberBufferMaxLength += 255;
              const tempBufferView2 = new Uint8Array(tagNumberBufferMaxLength);
              for (let i = 0; i < intTagNumberBuffer.length; i++)
                tempBufferView2[i] = intTagNumberBuffer[i];
              intTagNumberBuffer = this.valueHexView = new Uint8Array(tagNumberBufferMaxLength);
            }
          }
          this.blockLength = count + 1;
          intTagNumberBuffer[count - 1] = intBuffer[count] & 127;
          const tempBufferView = new Uint8Array(count);
          for (let i = 0; i < count; i++)
            tempBufferView[i] = intTagNumberBuffer[i];
          intTagNumberBuffer = this.valueHexView = new Uint8Array(count);
          intTagNumberBuffer.set(tempBufferView);
          if (this.blockLength <= 9)
            this.tagNumber = utilFromBase(intTagNumberBuffer, 7);
          else {
            this.isHexOnly = true;
            this.warnings.push("Tag too long, represented as hex-coded");
          }
        }
        if (this.tagClass === 1 && this.isConstructed) {
          switch (this.tagNumber) {
            case 1:
            case 2:
            case 5:
            case 6:
            case 9:
            case 13:
            case 14:
            case 23:
            case 24:
            case 31:
            case 32:
            case 33:
            case 34:
              this.error = "Constructed encoding used for primitive type";
              return -1;
          }
        }
        return inputOffset + this.blockLength;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          tagClass: this.tagClass,
          tagNumber: this.tagNumber,
          isConstructed: this.isConstructed
        };
      }
    };
    __name(LocalIdentificationBlock, "LocalIdentificationBlock");
    LocalIdentificationBlock.NAME = "identificationBlock";
    LocalLengthBlock = class extends LocalBaseBlock {
      constructor({ lenBlock = {} } = {}) {
        var _a2, _b, _c;
        super();
        this.isIndefiniteForm = (_a2 = lenBlock.isIndefiniteForm) !== null && _a2 !== void 0 ? _a2 : false;
        this.longFormUsed = (_b = lenBlock.longFormUsed) !== null && _b !== void 0 ? _b : false;
        this.length = (_c = lenBlock.length) !== null && _c !== void 0 ? _c : 0;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const view = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, view, inputOffset, inputLength)) {
          return -1;
        }
        const intBuffer = view.subarray(inputOffset, inputOffset + inputLength);
        if (intBuffer.length === 0) {
          this.error = "Zero buffer length";
          return -1;
        }
        if (intBuffer[0] === 255) {
          this.error = "Length block 0xFF is reserved by standard";
          return -1;
        }
        this.isIndefiniteForm = intBuffer[0] === 128;
        if (this.isIndefiniteForm) {
          this.blockLength = 1;
          return inputOffset + this.blockLength;
        }
        this.longFormUsed = !!(intBuffer[0] & 128);
        if (this.longFormUsed === false) {
          this.length = intBuffer[0];
          this.blockLength = 1;
          return inputOffset + this.blockLength;
        }
        const count = intBuffer[0] & 127;
        if (count > 8) {
          this.error = "Too big integer";
          return -1;
        }
        if (count + 1 > intBuffer.length) {
          this.error = "End of input reached before message was fully decoded";
          return -1;
        }
        const lenOffset = inputOffset + 1;
        const lengthBufferView = view.subarray(lenOffset, lenOffset + count);
        if (lengthBufferView[count - 1] === 0)
          this.warnings.push("Needlessly long encoded length");
        this.length = utilFromBase(lengthBufferView, 8);
        if (this.longFormUsed && this.length <= 127)
          this.warnings.push("Unnecessary usage of long length form");
        this.blockLength = count + 1;
        return inputOffset + this.blockLength;
      }
      toBER(sizeOnly = false) {
        let retBuf;
        let retView;
        if (this.length > 127)
          this.longFormUsed = true;
        if (this.isIndefiniteForm) {
          retBuf = new ArrayBuffer(1);
          if (sizeOnly === false) {
            retView = new Uint8Array(retBuf);
            retView[0] = 128;
          }
          return retBuf;
        }
        if (this.longFormUsed) {
          const encodedBuf = utilToBase(this.length, 8);
          if (encodedBuf.byteLength > 127) {
            this.error = "Too big length";
            return EMPTY_BUFFER;
          }
          retBuf = new ArrayBuffer(encodedBuf.byteLength + 1);
          if (sizeOnly)
            return retBuf;
          const encodedView = new Uint8Array(encodedBuf);
          retView = new Uint8Array(retBuf);
          retView[0] = encodedBuf.byteLength | 128;
          for (let i = 0; i < encodedBuf.byteLength; i++)
            retView[i + 1] = encodedView[i];
          return retBuf;
        }
        retBuf = new ArrayBuffer(1);
        if (sizeOnly === false) {
          retView = new Uint8Array(retBuf);
          retView[0] = this.length;
        }
        return retBuf;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          isIndefiniteForm: this.isIndefiniteForm,
          longFormUsed: this.longFormUsed,
          length: this.length
        };
      }
    };
    __name(LocalLengthBlock, "LocalLengthBlock");
    LocalLengthBlock.NAME = "lengthBlock";
    typeStore = {};
    BaseBlock = class extends LocalBaseBlock {
      constructor({ name = EMPTY_STRING, optional = false, primitiveSchema, ...parameters } = {}, valueBlockType) {
        super(parameters);
        this.name = name;
        this.optional = optional;
        if (primitiveSchema) {
          this.primitiveSchema = primitiveSchema;
        }
        this.idBlock = new LocalIdentificationBlock(parameters);
        this.lenBlock = new LocalLengthBlock(parameters);
        this.valueBlock = valueBlockType ? new valueBlockType(parameters) : new ValueBlock(parameters);
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const resultOffset = this.valueBlock.fromBER(inputBuffer, inputOffset, this.lenBlock.isIndefiniteForm ? inputLength : this.lenBlock.length);
        if (resultOffset === -1) {
          this.error = this.valueBlock.error;
          return resultOffset;
        }
        if (!this.idBlock.error.length)
          this.blockLength += this.idBlock.blockLength;
        if (!this.lenBlock.error.length)
          this.blockLength += this.lenBlock.blockLength;
        if (!this.valueBlock.error.length)
          this.blockLength += this.valueBlock.blockLength;
        return resultOffset;
      }
      toBER(sizeOnly, writer) {
        const _writer = writer || new ViewWriter();
        if (!writer) {
          prepareIndefiniteForm(this);
        }
        const idBlockBuf = this.idBlock.toBER(sizeOnly);
        _writer.write(idBlockBuf);
        if (this.lenBlock.isIndefiniteForm) {
          _writer.write(new Uint8Array([128]).buffer);
          this.valueBlock.toBER(sizeOnly, _writer);
          _writer.write(new ArrayBuffer(2));
        } else {
          const valueBlockBuf = this.valueBlock.toBER(sizeOnly);
          this.lenBlock.length = valueBlockBuf.byteLength;
          const lenBlockBuf = this.lenBlock.toBER(sizeOnly);
          _writer.write(lenBlockBuf);
          _writer.write(valueBlockBuf);
        }
        if (!writer) {
          return _writer.final();
        }
        return EMPTY_BUFFER;
      }
      toJSON() {
        const object = {
          ...super.toJSON(),
          idBlock: this.idBlock.toJSON(),
          lenBlock: this.lenBlock.toJSON(),
          valueBlock: this.valueBlock.toJSON(),
          name: this.name,
          optional: this.optional
        };
        if (this.primitiveSchema)
          object.primitiveSchema = this.primitiveSchema.toJSON();
        return object;
      }
      toString(encoding = "ascii") {
        if (encoding === "ascii") {
          return this.onAsciiEncoding();
        }
        return Convert.ToHex(this.toBER());
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : ${Convert.ToHex(this.valueBlock.valueBeforeDecodeView)}`;
      }
      isEqual(other) {
        if (this === other) {
          return true;
        }
        if (!(other instanceof this.constructor)) {
          return false;
        }
        const thisRaw = this.toBER();
        const otherRaw = other.toBER();
        return isEqualBuffer(thisRaw, otherRaw);
      }
    };
    __name(BaseBlock, "BaseBlock");
    BaseBlock.NAME = "BaseBlock";
    __name(prepareIndefiniteForm, "prepareIndefiniteForm");
    BaseStringBlock = class extends BaseBlock {
      constructor({ value = EMPTY_STRING, ...parameters } = {}, stringValueBlockType) {
        super(parameters, stringValueBlockType);
        if (value) {
          this.fromString(value);
        }
      }
      getValue() {
        return this.valueBlock.value;
      }
      setValue(value) {
        this.valueBlock.value = value;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const resultOffset = this.valueBlock.fromBER(inputBuffer, inputOffset, this.lenBlock.isIndefiniteForm ? inputLength : this.lenBlock.length);
        if (resultOffset === -1) {
          this.error = this.valueBlock.error;
          return resultOffset;
        }
        this.fromBuffer(this.valueBlock.valueHexView);
        if (!this.idBlock.error.length)
          this.blockLength += this.idBlock.blockLength;
        if (!this.lenBlock.error.length)
          this.blockLength += this.lenBlock.blockLength;
        if (!this.valueBlock.error.length)
          this.blockLength += this.valueBlock.blockLength;
        return resultOffset;
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : '${this.valueBlock.value}'`;
      }
    };
    __name(BaseStringBlock, "BaseStringBlock");
    BaseStringBlock.NAME = "BaseStringBlock";
    LocalPrimitiveValueBlock = class extends HexBlock(ValueBlock) {
      constructor({ isHexOnly = true, ...parameters } = {}) {
        super(parameters);
        this.isHexOnly = isHexOnly;
      }
    };
    __name(LocalPrimitiveValueBlock, "LocalPrimitiveValueBlock");
    LocalPrimitiveValueBlock.NAME = "PrimitiveValueBlock";
    Primitive = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalPrimitiveValueBlock);
        this.idBlock.isConstructed = false;
      }
    };
    __name(Primitive, "Primitive");
    _a$w = Primitive;
    (() => {
      typeStore.Primitive = _a$w;
    })();
    Primitive.NAME = "PRIMITIVE";
    __name(localChangeType, "localChangeType");
    __name(localFromBER, "localFromBER");
    __name(fromBER, "fromBER");
    __name(checkLen, "checkLen");
    LocalConstructedValueBlock = class extends ValueBlock {
      constructor({ value = [], isIndefiniteForm = false, ...parameters } = {}) {
        super(parameters);
        this.value = value;
        this.isIndefiniteForm = isIndefiniteForm;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const view = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, view, inputOffset, inputLength)) {
          return -1;
        }
        this.valueBeforeDecodeView = view.subarray(inputOffset, inputOffset + inputLength);
        if (this.valueBeforeDecodeView.length === 0) {
          this.warnings.push("Zero buffer length");
          return inputOffset;
        }
        let currentOffset = inputOffset;
        while (checkLen(this.isIndefiniteForm, inputLength) > 0) {
          const returnObject = localFromBER(view, currentOffset, inputLength);
          if (returnObject.offset === -1) {
            this.error = returnObject.result.error;
            this.warnings.concat(returnObject.result.warnings);
            return -1;
          }
          currentOffset = returnObject.offset;
          this.blockLength += returnObject.result.blockLength;
          inputLength -= returnObject.result.blockLength;
          this.value.push(returnObject.result);
          if (this.isIndefiniteForm && returnObject.result.constructor.NAME === END_OF_CONTENT_NAME) {
            break;
          }
        }
        if (this.isIndefiniteForm) {
          if (this.value[this.value.length - 1].constructor.NAME === END_OF_CONTENT_NAME) {
            this.value.pop();
          } else {
            this.warnings.push("No EndOfContent block encoded");
          }
        }
        return currentOffset;
      }
      toBER(sizeOnly, writer) {
        const _writer = writer || new ViewWriter();
        for (let i = 0; i < this.value.length; i++) {
          this.value[i].toBER(sizeOnly, _writer);
        }
        if (!writer) {
          return _writer.final();
        }
        return EMPTY_BUFFER;
      }
      toJSON() {
        const object = {
          ...super.toJSON(),
          isIndefiniteForm: this.isIndefiniteForm,
          value: []
        };
        for (const value of this.value) {
          object.value.push(value.toJSON());
        }
        return object;
      }
    };
    __name(LocalConstructedValueBlock, "LocalConstructedValueBlock");
    LocalConstructedValueBlock.NAME = "ConstructedValueBlock";
    Constructed = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalConstructedValueBlock);
        this.idBlock.isConstructed = true;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        this.valueBlock.isIndefiniteForm = this.lenBlock.isIndefiniteForm;
        const resultOffset = this.valueBlock.fromBER(inputBuffer, inputOffset, this.lenBlock.isIndefiniteForm ? inputLength : this.lenBlock.length);
        if (resultOffset === -1) {
          this.error = this.valueBlock.error;
          return resultOffset;
        }
        if (!this.idBlock.error.length)
          this.blockLength += this.idBlock.blockLength;
        if (!this.lenBlock.error.length)
          this.blockLength += this.lenBlock.blockLength;
        if (!this.valueBlock.error.length)
          this.blockLength += this.valueBlock.blockLength;
        return resultOffset;
      }
      onAsciiEncoding() {
        const values = [];
        for (const value of this.valueBlock.value) {
          values.push(value.toString("ascii").split("\n").map((o) => `  ${o}`).join("\n"));
        }
        const blockName = this.idBlock.tagClass === 3 ? `[${this.idBlock.tagNumber}]` : this.constructor.NAME;
        return values.length ? `${blockName} :
${values.join("\n")}` : `${blockName} :`;
      }
    };
    __name(Constructed, "Constructed");
    _a$v = Constructed;
    (() => {
      typeStore.Constructed = _a$v;
    })();
    Constructed.NAME = "CONSTRUCTED";
    LocalEndOfContentValueBlock = class extends ValueBlock {
      fromBER(inputBuffer, inputOffset, inputLength) {
        return inputOffset;
      }
      toBER(sizeOnly) {
        return EMPTY_BUFFER;
      }
    };
    __name(LocalEndOfContentValueBlock, "LocalEndOfContentValueBlock");
    LocalEndOfContentValueBlock.override = "EndOfContentValueBlock";
    EndOfContent = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalEndOfContentValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 0;
      }
    };
    __name(EndOfContent, "EndOfContent");
    _a$u = EndOfContent;
    (() => {
      typeStore.EndOfContent = _a$u;
    })();
    EndOfContent.NAME = END_OF_CONTENT_NAME;
    Null = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, ValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 5;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        if (this.lenBlock.length > 0)
          this.warnings.push("Non-zero length of value block for Null type");
        if (!this.idBlock.error.length)
          this.blockLength += this.idBlock.blockLength;
        if (!this.lenBlock.error.length)
          this.blockLength += this.lenBlock.blockLength;
        this.blockLength += inputLength;
        if (inputOffset + inputLength > inputBuffer.byteLength) {
          this.error = "End of input reached before message was fully decoded (inconsistent offset and length values)";
          return -1;
        }
        return inputOffset + inputLength;
      }
      toBER(sizeOnly, writer) {
        const retBuf = new ArrayBuffer(2);
        if (!sizeOnly) {
          const retView = new Uint8Array(retBuf);
          retView[0] = 5;
          retView[1] = 0;
        }
        if (writer) {
          writer.write(retBuf);
        }
        return retBuf;
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME}`;
      }
    };
    __name(Null, "Null");
    _a$t = Null;
    (() => {
      typeStore.Null = _a$t;
    })();
    Null.NAME = "NULL";
    LocalBooleanValueBlock = class extends HexBlock(ValueBlock) {
      constructor({ value, ...parameters } = {}) {
        super(parameters);
        if (parameters.valueHex) {
          this.valueHexView = BufferSourceConverter.toUint8Array(parameters.valueHex);
        } else {
          this.valueHexView = new Uint8Array(1);
        }
        if (value) {
          this.value = value;
        }
      }
      get value() {
        for (const octet of this.valueHexView) {
          if (octet > 0) {
            return true;
          }
        }
        return false;
      }
      set value(value) {
        this.valueHexView[0] = value ? 255 : 0;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const inputView = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, inputView, inputOffset, inputLength)) {
          return -1;
        }
        this.valueHexView = inputView.subarray(inputOffset, inputOffset + inputLength);
        if (inputLength > 1)
          this.warnings.push("Boolean value encoded in more then 1 octet");
        this.isHexOnly = true;
        utilDecodeTC.call(this);
        this.blockLength = inputLength;
        return inputOffset + inputLength;
      }
      toBER() {
        return this.valueHexView.slice();
      }
      toJSON() {
        return {
          ...super.toJSON(),
          value: this.value
        };
      }
    };
    __name(LocalBooleanValueBlock, "LocalBooleanValueBlock");
    LocalBooleanValueBlock.NAME = "BooleanValueBlock";
    Boolean2 = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalBooleanValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 1;
      }
      getValue() {
        return this.valueBlock.value;
      }
      setValue(value) {
        this.valueBlock.value = value;
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : ${this.getValue}`;
      }
    };
    __name(Boolean2, "Boolean");
    _a$s = Boolean2;
    (() => {
      typeStore.Boolean = _a$s;
    })();
    Boolean2.NAME = "BOOLEAN";
    LocalOctetStringValueBlock = class extends HexBlock(LocalConstructedValueBlock) {
      constructor({ isConstructed = false, ...parameters } = {}) {
        super(parameters);
        this.isConstructed = isConstructed;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        let resultOffset = 0;
        if (this.isConstructed) {
          this.isHexOnly = false;
          resultOffset = LocalConstructedValueBlock.prototype.fromBER.call(this, inputBuffer, inputOffset, inputLength);
          if (resultOffset === -1)
            return resultOffset;
          for (let i = 0; i < this.value.length; i++) {
            const currentBlockName = this.value[i].constructor.NAME;
            if (currentBlockName === END_OF_CONTENT_NAME) {
              if (this.isIndefiniteForm)
                break;
              else {
                this.error = "EndOfContent is unexpected, OCTET STRING may consists of OCTET STRINGs only";
                return -1;
              }
            }
            if (currentBlockName !== OCTET_STRING_NAME) {
              this.error = "OCTET STRING may consists of OCTET STRINGs only";
              return -1;
            }
          }
        } else {
          this.isHexOnly = true;
          resultOffset = super.fromBER(inputBuffer, inputOffset, inputLength);
          this.blockLength = inputLength;
        }
        return resultOffset;
      }
      toBER(sizeOnly, writer) {
        if (this.isConstructed)
          return LocalConstructedValueBlock.prototype.toBER.call(this, sizeOnly, writer);
        return sizeOnly ? new ArrayBuffer(this.valueHexView.byteLength) : this.valueHexView.slice().buffer;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          isConstructed: this.isConstructed
        };
      }
    };
    __name(LocalOctetStringValueBlock, "LocalOctetStringValueBlock");
    LocalOctetStringValueBlock.NAME = "OctetStringValueBlock";
    OctetString = class extends BaseBlock {
      constructor({ idBlock = {}, lenBlock = {}, ...parameters } = {}) {
        var _b, _c;
        (_b = parameters.isConstructed) !== null && _b !== void 0 ? _b : parameters.isConstructed = !!((_c = parameters.value) === null || _c === void 0 ? void 0 : _c.length);
        super({
          idBlock: {
            isConstructed: parameters.isConstructed,
            ...idBlock
          },
          lenBlock: {
            ...lenBlock,
            isIndefiniteForm: !!parameters.isIndefiniteForm
          },
          ...parameters
        }, LocalOctetStringValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 4;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        this.valueBlock.isConstructed = this.idBlock.isConstructed;
        this.valueBlock.isIndefiniteForm = this.lenBlock.isIndefiniteForm;
        if (inputLength === 0) {
          if (this.idBlock.error.length === 0)
            this.blockLength += this.idBlock.blockLength;
          if (this.lenBlock.error.length === 0)
            this.blockLength += this.lenBlock.blockLength;
          return inputOffset;
        }
        if (!this.valueBlock.isConstructed) {
          const view = inputBuffer instanceof ArrayBuffer ? new Uint8Array(inputBuffer) : inputBuffer;
          const buf = view.subarray(inputOffset, inputOffset + inputLength);
          try {
            if (buf.byteLength) {
              const asn = localFromBER(buf, 0, buf.byteLength);
              if (asn.offset !== -1 && asn.offset === inputLength) {
                this.valueBlock.value = [asn.result];
              }
            }
          } catch (e) {
          }
        }
        return super.fromBER(inputBuffer, inputOffset, inputLength);
      }
      onAsciiEncoding() {
        if (this.valueBlock.isConstructed || this.valueBlock.value && this.valueBlock.value.length) {
          return Constructed.prototype.onAsciiEncoding.call(this);
        }
        return `${this.constructor.NAME} : ${Convert.ToHex(this.valueBlock.valueHexView)}`;
      }
      getValue() {
        if (!this.idBlock.isConstructed) {
          return this.valueBlock.valueHexView.slice().buffer;
        }
        const array = [];
        for (const content of this.valueBlock.value) {
          if (content instanceof OctetString) {
            array.push(content.valueBlock.valueHexView);
          }
        }
        return BufferSourceConverter.concat(array);
      }
    };
    __name(OctetString, "OctetString");
    _a$r = OctetString;
    (() => {
      typeStore.OctetString = _a$r;
    })();
    OctetString.NAME = OCTET_STRING_NAME;
    LocalBitStringValueBlock = class extends HexBlock(LocalConstructedValueBlock) {
      constructor({ unusedBits = 0, isConstructed = false, ...parameters } = {}) {
        super(parameters);
        this.unusedBits = unusedBits;
        this.isConstructed = isConstructed;
        this.blockLength = this.valueHexView.byteLength;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        if (!inputLength) {
          return inputOffset;
        }
        let resultOffset = -1;
        if (this.isConstructed) {
          resultOffset = LocalConstructedValueBlock.prototype.fromBER.call(this, inputBuffer, inputOffset, inputLength);
          if (resultOffset === -1)
            return resultOffset;
          for (const value of this.value) {
            const currentBlockName = value.constructor.NAME;
            if (currentBlockName === END_OF_CONTENT_NAME) {
              if (this.isIndefiniteForm)
                break;
              else {
                this.error = "EndOfContent is unexpected, BIT STRING may consists of BIT STRINGs only";
                return -1;
              }
            }
            if (currentBlockName !== BIT_STRING_NAME) {
              this.error = "BIT STRING may consists of BIT STRINGs only";
              return -1;
            }
            const valueBlock = value.valueBlock;
            if (this.unusedBits > 0 && valueBlock.unusedBits > 0) {
              this.error = 'Using of "unused bits" inside constructive BIT STRING allowed for least one only';
              return -1;
            }
            this.unusedBits = valueBlock.unusedBits;
          }
          return resultOffset;
        }
        const inputView = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, inputView, inputOffset, inputLength)) {
          return -1;
        }
        const intBuffer = inputView.subarray(inputOffset, inputOffset + inputLength);
        this.unusedBits = intBuffer[0];
        if (this.unusedBits > 7) {
          this.error = "Unused bits for BitString must be in range 0-7";
          return -1;
        }
        if (!this.unusedBits) {
          const buf = intBuffer.subarray(1);
          try {
            if (buf.byteLength) {
              const asn = localFromBER(buf, 0, buf.byteLength);
              if (asn.offset !== -1 && asn.offset === inputLength - 1) {
                this.value = [asn.result];
              }
            }
          } catch (e) {
          }
        }
        this.valueHexView = intBuffer.subarray(1);
        this.blockLength = intBuffer.length;
        return inputOffset + inputLength;
      }
      toBER(sizeOnly, writer) {
        if (this.isConstructed) {
          return LocalConstructedValueBlock.prototype.toBER.call(this, sizeOnly, writer);
        }
        if (sizeOnly) {
          return new ArrayBuffer(this.valueHexView.byteLength + 1);
        }
        if (!this.valueHexView.byteLength) {
          return EMPTY_BUFFER;
        }
        const retView = new Uint8Array(this.valueHexView.length + 1);
        retView[0] = this.unusedBits;
        retView.set(this.valueHexView, 1);
        return retView.buffer;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          unusedBits: this.unusedBits,
          isConstructed: this.isConstructed
        };
      }
    };
    __name(LocalBitStringValueBlock, "LocalBitStringValueBlock");
    LocalBitStringValueBlock.NAME = "BitStringValueBlock";
    BitString = class extends BaseBlock {
      constructor({ idBlock = {}, lenBlock = {}, ...parameters } = {}) {
        var _b, _c;
        (_b = parameters.isConstructed) !== null && _b !== void 0 ? _b : parameters.isConstructed = !!((_c = parameters.value) === null || _c === void 0 ? void 0 : _c.length);
        super({
          idBlock: {
            isConstructed: parameters.isConstructed,
            ...idBlock
          },
          lenBlock: {
            ...lenBlock,
            isIndefiniteForm: !!parameters.isIndefiniteForm
          },
          ...parameters
        }, LocalBitStringValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 3;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        this.valueBlock.isConstructed = this.idBlock.isConstructed;
        this.valueBlock.isIndefiniteForm = this.lenBlock.isIndefiniteForm;
        return super.fromBER(inputBuffer, inputOffset, inputLength);
      }
      onAsciiEncoding() {
        if (this.valueBlock.isConstructed || this.valueBlock.value && this.valueBlock.value.length) {
          return Constructed.prototype.onAsciiEncoding.call(this);
        } else {
          const bits = [];
          const valueHex = this.valueBlock.valueHexView;
          for (const byte of valueHex) {
            bits.push(byte.toString(2).padStart(8, "0"));
          }
          const bitsStr = bits.join("");
          return `${this.constructor.NAME} : ${bitsStr.substring(0, bitsStr.length - this.valueBlock.unusedBits)}`;
        }
      }
    };
    __name(BitString, "BitString");
    _a$q = BitString;
    (() => {
      typeStore.BitString = _a$q;
    })();
    BitString.NAME = BIT_STRING_NAME;
    __name(viewAdd, "viewAdd");
    __name(power2, "power2");
    __name(viewSub, "viewSub");
    LocalIntegerValueBlock = class extends HexBlock(ValueBlock) {
      constructor({ value, ...parameters } = {}) {
        super(parameters);
        this._valueDec = 0;
        if (parameters.valueHex) {
          this.setValueHex();
        }
        if (value !== void 0) {
          this.valueDec = value;
        }
      }
      setValueHex() {
        if (this.valueHexView.length >= 4) {
          this.warnings.push("Too big Integer for decoding, hex only");
          this.isHexOnly = true;
          this._valueDec = 0;
        } else {
          this.isHexOnly = false;
          if (this.valueHexView.length > 0) {
            this._valueDec = utilDecodeTC.call(this);
          }
        }
      }
      set valueDec(v) {
        this._valueDec = v;
        this.isHexOnly = false;
        this.valueHexView = new Uint8Array(utilEncodeTC(v));
      }
      get valueDec() {
        return this._valueDec;
      }
      fromDER(inputBuffer, inputOffset, inputLength, expectedLength = 0) {
        const offset = this.fromBER(inputBuffer, inputOffset, inputLength);
        if (offset === -1)
          return offset;
        const view = this.valueHexView;
        if (view[0] === 0 && (view[1] & 128) !== 0) {
          this.valueHexView = view.subarray(1);
        } else {
          if (expectedLength !== 0) {
            if (view.length < expectedLength) {
              if (expectedLength - view.length > 1)
                expectedLength = view.length + 1;
              this.valueHexView = view.subarray(expectedLength - view.length);
            }
          }
        }
        return offset;
      }
      toDER(sizeOnly = false) {
        const view = this.valueHexView;
        switch (true) {
          case (view[0] & 128) !== 0:
            {
              const updatedView = new Uint8Array(this.valueHexView.length + 1);
              updatedView[0] = 0;
              updatedView.set(view, 1);
              this.valueHexView = updatedView;
            }
            break;
          case (view[0] === 0 && (view[1] & 128) === 0):
            {
              this.valueHexView = this.valueHexView.subarray(1);
            }
            break;
        }
        return this.toBER(sizeOnly);
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const resultOffset = super.fromBER(inputBuffer, inputOffset, inputLength);
        if (resultOffset === -1) {
          return resultOffset;
        }
        this.setValueHex();
        return resultOffset;
      }
      toBER(sizeOnly) {
        return sizeOnly ? new ArrayBuffer(this.valueHexView.length) : this.valueHexView.slice().buffer;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          valueDec: this.valueDec
        };
      }
      toString() {
        const firstBit = this.valueHexView.length * 8 - 1;
        let digits = new Uint8Array(this.valueHexView.length * 8 / 3);
        let bitNumber = 0;
        let currentByte;
        const asn1View = this.valueHexView;
        let result = "";
        let flag = false;
        for (let byteNumber = asn1View.byteLength - 1; byteNumber >= 0; byteNumber--) {
          currentByte = asn1View[byteNumber];
          for (let i = 0; i < 8; i++) {
            if ((currentByte & 1) === 1) {
              switch (bitNumber) {
                case firstBit:
                  digits = viewSub(power2(bitNumber), digits);
                  result = "-";
                  break;
                default:
                  digits = viewAdd(digits, power2(bitNumber));
              }
            }
            bitNumber++;
            currentByte >>= 1;
          }
        }
        for (let i = 0; i < digits.length; i++) {
          if (digits[i])
            flag = true;
          if (flag)
            result += digitsString.charAt(digits[i]);
        }
        if (flag === false)
          result += digitsString.charAt(0);
        return result;
      }
    };
    __name(LocalIntegerValueBlock, "LocalIntegerValueBlock");
    _a$p = LocalIntegerValueBlock;
    LocalIntegerValueBlock.NAME = "IntegerValueBlock";
    (() => {
      Object.defineProperty(_a$p.prototype, "valueHex", {
        set: function(v) {
          this.valueHexView = new Uint8Array(v);
          this.setValueHex();
        },
        get: function() {
          return this.valueHexView.slice().buffer;
        }
      });
    })();
    Integer = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalIntegerValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 2;
      }
      toBigInt() {
        assertBigInt();
        return BigInt(this.valueBlock.toString());
      }
      static fromBigInt(value) {
        assertBigInt();
        const bigIntValue = BigInt(value);
        const writer = new ViewWriter();
        const hex = bigIntValue.toString(16).replace(/^-/, "");
        const view = new Uint8Array(Convert.FromHex(hex));
        if (bigIntValue < 0) {
          const first = new Uint8Array(view.length + (view[0] & 128 ? 1 : 0));
          first[0] |= 128;
          const firstInt = BigInt(`0x${Convert.ToHex(first)}`);
          const secondInt = firstInt + bigIntValue;
          const second = BufferSourceConverter.toUint8Array(Convert.FromHex(secondInt.toString(16)));
          second[0] |= 128;
          writer.write(second);
        } else {
          if (view[0] & 128) {
            writer.write(new Uint8Array([0]));
          }
          writer.write(view);
        }
        const res = new Integer({
          valueHex: writer.final()
        });
        return res;
      }
      convertToDER() {
        const integer = new Integer({ valueHex: this.valueBlock.valueHexView });
        integer.valueBlock.toDER();
        return integer;
      }
      convertFromDER() {
        return new Integer({
          valueHex: this.valueBlock.valueHexView[0] === 0 ? this.valueBlock.valueHexView.subarray(1) : this.valueBlock.valueHexView
        });
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : ${this.valueBlock.toString()}`;
      }
    };
    __name(Integer, "Integer");
    _a$o = Integer;
    (() => {
      typeStore.Integer = _a$o;
    })();
    Integer.NAME = "INTEGER";
    Enumerated = class extends Integer {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 10;
      }
    };
    __name(Enumerated, "Enumerated");
    _a$n = Enumerated;
    (() => {
      typeStore.Enumerated = _a$n;
    })();
    Enumerated.NAME = "ENUMERATED";
    LocalSidValueBlock = class extends HexBlock(ValueBlock) {
      constructor({ valueDec = -1, isFirstSid = false, ...parameters } = {}) {
        super(parameters);
        this.valueDec = valueDec;
        this.isFirstSid = isFirstSid;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        if (!inputLength) {
          return inputOffset;
        }
        const inputView = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, inputView, inputOffset, inputLength)) {
          return -1;
        }
        const intBuffer = inputView.subarray(inputOffset, inputOffset + inputLength);
        this.valueHexView = new Uint8Array(inputLength);
        for (let i = 0; i < inputLength; i++) {
          this.valueHexView[i] = intBuffer[i] & 127;
          this.blockLength++;
          if ((intBuffer[i] & 128) === 0)
            break;
        }
        const tempView = new Uint8Array(this.blockLength);
        for (let i = 0; i < this.blockLength; i++) {
          tempView[i] = this.valueHexView[i];
        }
        this.valueHexView = tempView;
        if ((intBuffer[this.blockLength - 1] & 128) !== 0) {
          this.error = "End of input reached before message was fully decoded";
          return -1;
        }
        if (this.valueHexView[0] === 0)
          this.warnings.push("Needlessly long format of SID encoding");
        if (this.blockLength <= 8)
          this.valueDec = utilFromBase(this.valueHexView, 7);
        else {
          this.isHexOnly = true;
          this.warnings.push("Too big SID for decoding, hex only");
        }
        return inputOffset + this.blockLength;
      }
      set valueBigInt(value) {
        assertBigInt();
        let bits = BigInt(value).toString(2);
        while (bits.length % 7) {
          bits = "0" + bits;
        }
        const bytes = new Uint8Array(bits.length / 7);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(bits.slice(i * 7, i * 7 + 7), 2) + (i + 1 < bytes.length ? 128 : 0);
        }
        this.fromBER(bytes.buffer, 0, bytes.length);
      }
      toBER(sizeOnly) {
        if (this.isHexOnly) {
          if (sizeOnly)
            return new ArrayBuffer(this.valueHexView.byteLength);
          const curView = this.valueHexView;
          const retView2 = new Uint8Array(this.blockLength);
          for (let i = 0; i < this.blockLength - 1; i++)
            retView2[i] = curView[i] | 128;
          retView2[this.blockLength - 1] = curView[this.blockLength - 1];
          return retView2.buffer;
        }
        const encodedBuf = utilToBase(this.valueDec, 7);
        if (encodedBuf.byteLength === 0) {
          this.error = "Error during encoding SID value";
          return EMPTY_BUFFER;
        }
        const retView = new Uint8Array(encodedBuf.byteLength);
        if (!sizeOnly) {
          const encodedView = new Uint8Array(encodedBuf);
          const len = encodedBuf.byteLength - 1;
          for (let i = 0; i < len; i++)
            retView[i] = encodedView[i] | 128;
          retView[len] = encodedView[len];
        }
        return retView;
      }
      toString() {
        let result = "";
        if (this.isHexOnly)
          result = Convert.ToHex(this.valueHexView);
        else {
          if (this.isFirstSid) {
            let sidValue = this.valueDec;
            if (this.valueDec <= 39)
              result = "0.";
            else {
              if (this.valueDec <= 79) {
                result = "1.";
                sidValue -= 40;
              } else {
                result = "2.";
                sidValue -= 80;
              }
            }
            result += sidValue.toString();
          } else
            result = this.valueDec.toString();
        }
        return result;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          valueDec: this.valueDec,
          isFirstSid: this.isFirstSid
        };
      }
    };
    __name(LocalSidValueBlock, "LocalSidValueBlock");
    LocalSidValueBlock.NAME = "sidBlock";
    LocalObjectIdentifierValueBlock = class extends ValueBlock {
      constructor({ value = EMPTY_STRING, ...parameters } = {}) {
        super(parameters);
        this.value = [];
        if (value) {
          this.fromString(value);
        }
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        let resultOffset = inputOffset;
        while (inputLength > 0) {
          const sidBlock = new LocalSidValueBlock();
          resultOffset = sidBlock.fromBER(inputBuffer, resultOffset, inputLength);
          if (resultOffset === -1) {
            this.blockLength = 0;
            this.error = sidBlock.error;
            return resultOffset;
          }
          if (this.value.length === 0)
            sidBlock.isFirstSid = true;
          this.blockLength += sidBlock.blockLength;
          inputLength -= sidBlock.blockLength;
          this.value.push(sidBlock);
        }
        return resultOffset;
      }
      toBER(sizeOnly) {
        const retBuffers = [];
        for (let i = 0; i < this.value.length; i++) {
          const valueBuf = this.value[i].toBER(sizeOnly);
          if (valueBuf.byteLength === 0) {
            this.error = this.value[i].error;
            return EMPTY_BUFFER;
          }
          retBuffers.push(valueBuf);
        }
        return concat(retBuffers);
      }
      fromString(string) {
        this.value = [];
        let pos1 = 0;
        let pos2 = 0;
        let sid = "";
        let flag = false;
        do {
          pos2 = string.indexOf(".", pos1);
          if (pos2 === -1)
            sid = string.substring(pos1);
          else
            sid = string.substring(pos1, pos2);
          pos1 = pos2 + 1;
          if (flag) {
            const sidBlock = this.value[0];
            let plus = 0;
            switch (sidBlock.valueDec) {
              case 0:
                break;
              case 1:
                plus = 40;
                break;
              case 2:
                plus = 80;
                break;
              default:
                this.value = [];
                return;
            }
            const parsedSID = parseInt(sid, 10);
            if (isNaN(parsedSID))
              return;
            sidBlock.valueDec = parsedSID + plus;
            flag = false;
          } else {
            const sidBlock = new LocalSidValueBlock();
            if (sid > Number.MAX_SAFE_INTEGER) {
              assertBigInt();
              const sidValue = BigInt(sid);
              sidBlock.valueBigInt = sidValue;
            } else {
              sidBlock.valueDec = parseInt(sid, 10);
              if (isNaN(sidBlock.valueDec))
                return;
            }
            if (!this.value.length) {
              sidBlock.isFirstSid = true;
              flag = true;
            }
            this.value.push(sidBlock);
          }
        } while (pos2 !== -1);
      }
      toString() {
        let result = "";
        let isHexOnly = false;
        for (let i = 0; i < this.value.length; i++) {
          isHexOnly = this.value[i].isHexOnly;
          let sidStr = this.value[i].toString();
          if (i !== 0)
            result = `${result}.`;
          if (isHexOnly) {
            sidStr = `{${sidStr}}`;
            if (this.value[i].isFirstSid)
              result = `2.{${sidStr} - 80}`;
            else
              result += sidStr;
          } else
            result += sidStr;
        }
        return result;
      }
      toJSON() {
        const object = {
          ...super.toJSON(),
          value: this.toString(),
          sidArray: []
        };
        for (let i = 0; i < this.value.length; i++) {
          object.sidArray.push(this.value[i].toJSON());
        }
        return object;
      }
    };
    __name(LocalObjectIdentifierValueBlock, "LocalObjectIdentifierValueBlock");
    LocalObjectIdentifierValueBlock.NAME = "ObjectIdentifierValueBlock";
    ObjectIdentifier = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalObjectIdentifierValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 6;
      }
      getValue() {
        return this.valueBlock.toString();
      }
      setValue(value) {
        this.valueBlock.fromString(value);
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : ${this.valueBlock.toString() || "empty"}`;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          value: this.getValue()
        };
      }
    };
    __name(ObjectIdentifier, "ObjectIdentifier");
    _a$m = ObjectIdentifier;
    (() => {
      typeStore.ObjectIdentifier = _a$m;
    })();
    ObjectIdentifier.NAME = "OBJECT IDENTIFIER";
    LocalRelativeSidValueBlock = class extends HexBlock(LocalBaseBlock) {
      constructor({ valueDec = 0, ...parameters } = {}) {
        super(parameters);
        this.valueDec = valueDec;
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        if (inputLength === 0)
          return inputOffset;
        const inputView = BufferSourceConverter.toUint8Array(inputBuffer);
        if (!checkBufferParams(this, inputView, inputOffset, inputLength))
          return -1;
        const intBuffer = inputView.subarray(inputOffset, inputOffset + inputLength);
        this.valueHexView = new Uint8Array(inputLength);
        for (let i = 0; i < inputLength; i++) {
          this.valueHexView[i] = intBuffer[i] & 127;
          this.blockLength++;
          if ((intBuffer[i] & 128) === 0)
            break;
        }
        const tempView = new Uint8Array(this.blockLength);
        for (let i = 0; i < this.blockLength; i++)
          tempView[i] = this.valueHexView[i];
        this.valueHexView = tempView;
        if ((intBuffer[this.blockLength - 1] & 128) !== 0) {
          this.error = "End of input reached before message was fully decoded";
          return -1;
        }
        if (this.valueHexView[0] === 0)
          this.warnings.push("Needlessly long format of SID encoding");
        if (this.blockLength <= 8)
          this.valueDec = utilFromBase(this.valueHexView, 7);
        else {
          this.isHexOnly = true;
          this.warnings.push("Too big SID for decoding, hex only");
        }
        return inputOffset + this.blockLength;
      }
      toBER(sizeOnly) {
        if (this.isHexOnly) {
          if (sizeOnly)
            return new ArrayBuffer(this.valueHexView.byteLength);
          const curView = this.valueHexView;
          const retView2 = new Uint8Array(this.blockLength);
          for (let i = 0; i < this.blockLength - 1; i++)
            retView2[i] = curView[i] | 128;
          retView2[this.blockLength - 1] = curView[this.blockLength - 1];
          return retView2.buffer;
        }
        const encodedBuf = utilToBase(this.valueDec, 7);
        if (encodedBuf.byteLength === 0) {
          this.error = "Error during encoding SID value";
          return EMPTY_BUFFER;
        }
        const retView = new Uint8Array(encodedBuf.byteLength);
        if (!sizeOnly) {
          const encodedView = new Uint8Array(encodedBuf);
          const len = encodedBuf.byteLength - 1;
          for (let i = 0; i < len; i++)
            retView[i] = encodedView[i] | 128;
          retView[len] = encodedView[len];
        }
        return retView.buffer;
      }
      toString() {
        let result = "";
        if (this.isHexOnly)
          result = Convert.ToHex(this.valueHexView);
        else {
          result = this.valueDec.toString();
        }
        return result;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          valueDec: this.valueDec
        };
      }
    };
    __name(LocalRelativeSidValueBlock, "LocalRelativeSidValueBlock");
    LocalRelativeSidValueBlock.NAME = "relativeSidBlock";
    LocalRelativeObjectIdentifierValueBlock = class extends ValueBlock {
      constructor({ value = EMPTY_STRING, ...parameters } = {}) {
        super(parameters);
        this.value = [];
        if (value) {
          this.fromString(value);
        }
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        let resultOffset = inputOffset;
        while (inputLength > 0) {
          const sidBlock = new LocalRelativeSidValueBlock();
          resultOffset = sidBlock.fromBER(inputBuffer, resultOffset, inputLength);
          if (resultOffset === -1) {
            this.blockLength = 0;
            this.error = sidBlock.error;
            return resultOffset;
          }
          this.blockLength += sidBlock.blockLength;
          inputLength -= sidBlock.blockLength;
          this.value.push(sidBlock);
        }
        return resultOffset;
      }
      toBER(sizeOnly, writer) {
        const retBuffers = [];
        for (let i = 0; i < this.value.length; i++) {
          const valueBuf = this.value[i].toBER(sizeOnly);
          if (valueBuf.byteLength === 0) {
            this.error = this.value[i].error;
            return EMPTY_BUFFER;
          }
          retBuffers.push(valueBuf);
        }
        return concat(retBuffers);
      }
      fromString(string) {
        this.value = [];
        let pos1 = 0;
        let pos2 = 0;
        let sid = "";
        do {
          pos2 = string.indexOf(".", pos1);
          if (pos2 === -1)
            sid = string.substring(pos1);
          else
            sid = string.substring(pos1, pos2);
          pos1 = pos2 + 1;
          const sidBlock = new LocalRelativeSidValueBlock();
          sidBlock.valueDec = parseInt(sid, 10);
          if (isNaN(sidBlock.valueDec))
            return true;
          this.value.push(sidBlock);
        } while (pos2 !== -1);
        return true;
      }
      toString() {
        let result = "";
        let isHexOnly = false;
        for (let i = 0; i < this.value.length; i++) {
          isHexOnly = this.value[i].isHexOnly;
          let sidStr = this.value[i].toString();
          if (i !== 0)
            result = `${result}.`;
          if (isHexOnly) {
            sidStr = `{${sidStr}}`;
            result += sidStr;
          } else
            result += sidStr;
        }
        return result;
      }
      toJSON() {
        const object = {
          ...super.toJSON(),
          value: this.toString(),
          sidArray: []
        };
        for (let i = 0; i < this.value.length; i++)
          object.sidArray.push(this.value[i].toJSON());
        return object;
      }
    };
    __name(LocalRelativeObjectIdentifierValueBlock, "LocalRelativeObjectIdentifierValueBlock");
    LocalRelativeObjectIdentifierValueBlock.NAME = "RelativeObjectIdentifierValueBlock";
    RelativeObjectIdentifier = class extends BaseBlock {
      constructor(parameters = {}) {
        super(parameters, LocalRelativeObjectIdentifierValueBlock);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 13;
      }
      getValue() {
        return this.valueBlock.toString();
      }
      setValue(value) {
        this.valueBlock.fromString(value);
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : ${this.valueBlock.toString() || "empty"}`;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          value: this.getValue()
        };
      }
    };
    __name(RelativeObjectIdentifier, "RelativeObjectIdentifier");
    _a$l = RelativeObjectIdentifier;
    (() => {
      typeStore.RelativeObjectIdentifier = _a$l;
    })();
    RelativeObjectIdentifier.NAME = "RelativeObjectIdentifier";
    Sequence = class extends Constructed {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 16;
      }
    };
    __name(Sequence, "Sequence");
    _a$k = Sequence;
    (() => {
      typeStore.Sequence = _a$k;
    })();
    Sequence.NAME = "SEQUENCE";
    Set2 = class extends Constructed {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 17;
      }
    };
    __name(Set2, "Set");
    _a$j = Set2;
    (() => {
      typeStore.Set = _a$j;
    })();
    Set2.NAME = "SET";
    LocalStringValueBlock = class extends HexBlock(ValueBlock) {
      constructor({ ...parameters } = {}) {
        super(parameters);
        this.isHexOnly = true;
        this.value = EMPTY_STRING;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          value: this.value
        };
      }
    };
    __name(LocalStringValueBlock, "LocalStringValueBlock");
    LocalStringValueBlock.NAME = "StringValueBlock";
    LocalSimpleStringValueBlock = class extends LocalStringValueBlock {
    };
    __name(LocalSimpleStringValueBlock, "LocalSimpleStringValueBlock");
    LocalSimpleStringValueBlock.NAME = "SimpleStringValueBlock";
    LocalSimpleStringBlock = class extends BaseStringBlock {
      constructor({ ...parameters } = {}) {
        super(parameters, LocalSimpleStringValueBlock);
      }
      fromBuffer(inputBuffer) {
        this.valueBlock.value = String.fromCharCode.apply(null, BufferSourceConverter.toUint8Array(inputBuffer));
      }
      fromString(inputString) {
        const strLen = inputString.length;
        const view = this.valueBlock.valueHexView = new Uint8Array(strLen);
        for (let i = 0; i < strLen; i++)
          view[i] = inputString.charCodeAt(i);
        this.valueBlock.value = inputString;
      }
    };
    __name(LocalSimpleStringBlock, "LocalSimpleStringBlock");
    LocalSimpleStringBlock.NAME = "SIMPLE STRING";
    LocalUtf8StringValueBlock = class extends LocalSimpleStringBlock {
      fromBuffer(inputBuffer) {
        this.valueBlock.valueHexView = BufferSourceConverter.toUint8Array(inputBuffer);
        try {
          this.valueBlock.value = Convert.ToUtf8String(inputBuffer);
        } catch (ex) {
          this.warnings.push(`Error during "decodeURIComponent": ${ex}, using raw string`);
          this.valueBlock.value = Convert.ToBinary(inputBuffer);
        }
      }
      fromString(inputString) {
        this.valueBlock.valueHexView = new Uint8Array(Convert.FromUtf8String(inputString));
        this.valueBlock.value = inputString;
      }
    };
    __name(LocalUtf8StringValueBlock, "LocalUtf8StringValueBlock");
    LocalUtf8StringValueBlock.NAME = "Utf8StringValueBlock";
    Utf8String = class extends LocalUtf8StringValueBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 12;
      }
    };
    __name(Utf8String, "Utf8String");
    _a$i = Utf8String;
    (() => {
      typeStore.Utf8String = _a$i;
    })();
    Utf8String.NAME = "UTF8String";
    LocalBmpStringValueBlock = class extends LocalSimpleStringBlock {
      fromBuffer(inputBuffer) {
        this.valueBlock.value = Convert.ToUtf16String(inputBuffer);
        this.valueBlock.valueHexView = BufferSourceConverter.toUint8Array(inputBuffer);
      }
      fromString(inputString) {
        this.valueBlock.value = inputString;
        this.valueBlock.valueHexView = new Uint8Array(Convert.FromUtf16String(inputString));
      }
    };
    __name(LocalBmpStringValueBlock, "LocalBmpStringValueBlock");
    LocalBmpStringValueBlock.NAME = "BmpStringValueBlock";
    BmpString = class extends LocalBmpStringValueBlock {
      constructor({ ...parameters } = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 30;
      }
    };
    __name(BmpString, "BmpString");
    _a$h = BmpString;
    (() => {
      typeStore.BmpString = _a$h;
    })();
    BmpString.NAME = "BMPString";
    LocalUniversalStringValueBlock = class extends LocalSimpleStringBlock {
      fromBuffer(inputBuffer) {
        const copyBuffer = ArrayBuffer.isView(inputBuffer) ? inputBuffer.slice().buffer : inputBuffer.slice(0);
        const valueView = new Uint8Array(copyBuffer);
        for (let i = 0; i < valueView.length; i += 4) {
          valueView[i] = valueView[i + 3];
          valueView[i + 1] = valueView[i + 2];
          valueView[i + 2] = 0;
          valueView[i + 3] = 0;
        }
        this.valueBlock.value = String.fromCharCode.apply(null, new Uint32Array(copyBuffer));
      }
      fromString(inputString) {
        const strLength = inputString.length;
        const valueHexView = this.valueBlock.valueHexView = new Uint8Array(strLength * 4);
        for (let i = 0; i < strLength; i++) {
          const codeBuf = utilToBase(inputString.charCodeAt(i), 8);
          const codeView = new Uint8Array(codeBuf);
          if (codeView.length > 4)
            continue;
          const dif = 4 - codeView.length;
          for (let j = codeView.length - 1; j >= 0; j--)
            valueHexView[i * 4 + j + dif] = codeView[j];
        }
        this.valueBlock.value = inputString;
      }
    };
    __name(LocalUniversalStringValueBlock, "LocalUniversalStringValueBlock");
    LocalUniversalStringValueBlock.NAME = "UniversalStringValueBlock";
    UniversalString = class extends LocalUniversalStringValueBlock {
      constructor({ ...parameters } = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 28;
      }
    };
    __name(UniversalString, "UniversalString");
    _a$g = UniversalString;
    (() => {
      typeStore.UniversalString = _a$g;
    })();
    UniversalString.NAME = "UniversalString";
    NumericString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 18;
      }
    };
    __name(NumericString, "NumericString");
    _a$f = NumericString;
    (() => {
      typeStore.NumericString = _a$f;
    })();
    NumericString.NAME = "NumericString";
    PrintableString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 19;
      }
    };
    __name(PrintableString, "PrintableString");
    _a$e = PrintableString;
    (() => {
      typeStore.PrintableString = _a$e;
    })();
    PrintableString.NAME = "PrintableString";
    TeletexString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 20;
      }
    };
    __name(TeletexString, "TeletexString");
    _a$d = TeletexString;
    (() => {
      typeStore.TeletexString = _a$d;
    })();
    TeletexString.NAME = "TeletexString";
    VideotexString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 21;
      }
    };
    __name(VideotexString, "VideotexString");
    _a$c = VideotexString;
    (() => {
      typeStore.VideotexString = _a$c;
    })();
    VideotexString.NAME = "VideotexString";
    IA5String = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 22;
      }
    };
    __name(IA5String, "IA5String");
    _a$b = IA5String;
    (() => {
      typeStore.IA5String = _a$b;
    })();
    IA5String.NAME = "IA5String";
    GraphicString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 25;
      }
    };
    __name(GraphicString, "GraphicString");
    _a$a = GraphicString;
    (() => {
      typeStore.GraphicString = _a$a;
    })();
    GraphicString.NAME = "GraphicString";
    VisibleString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 26;
      }
    };
    __name(VisibleString, "VisibleString");
    _a$9 = VisibleString;
    (() => {
      typeStore.VisibleString = _a$9;
    })();
    VisibleString.NAME = "VisibleString";
    GeneralString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 27;
      }
    };
    __name(GeneralString, "GeneralString");
    _a$8 = GeneralString;
    (() => {
      typeStore.GeneralString = _a$8;
    })();
    GeneralString.NAME = "GeneralString";
    CharacterString = class extends LocalSimpleStringBlock {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 29;
      }
    };
    __name(CharacterString, "CharacterString");
    _a$7 = CharacterString;
    (() => {
      typeStore.CharacterString = _a$7;
    })();
    CharacterString.NAME = "CharacterString";
    UTCTime = class extends VisibleString {
      constructor({ value, valueDate, ...parameters } = {}) {
        super(parameters);
        this.year = 0;
        this.month = 0;
        this.day = 0;
        this.hour = 0;
        this.minute = 0;
        this.second = 0;
        if (value) {
          this.fromString(value);
          this.valueBlock.valueHexView = new Uint8Array(value.length);
          for (let i = 0; i < value.length; i++)
            this.valueBlock.valueHexView[i] = value.charCodeAt(i);
        }
        if (valueDate) {
          this.fromDate(valueDate);
          this.valueBlock.valueHexView = new Uint8Array(this.toBuffer());
        }
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 23;
      }
      fromBuffer(inputBuffer) {
        this.fromString(String.fromCharCode.apply(null, BufferSourceConverter.toUint8Array(inputBuffer)));
      }
      toBuffer() {
        const str = this.toString();
        const buffer = new ArrayBuffer(str.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < str.length; i++)
          view[i] = str.charCodeAt(i);
        return buffer;
      }
      fromDate(inputDate) {
        this.year = inputDate.getUTCFullYear();
        this.month = inputDate.getUTCMonth() + 1;
        this.day = inputDate.getUTCDate();
        this.hour = inputDate.getUTCHours();
        this.minute = inputDate.getUTCMinutes();
        this.second = inputDate.getUTCSeconds();
      }
      toDate() {
        return new Date(Date.UTC(this.year, this.month - 1, this.day, this.hour, this.minute, this.second));
      }
      fromString(inputString) {
        const parser = /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z/ig;
        const parserArray = parser.exec(inputString);
        if (parserArray === null) {
          this.error = "Wrong input string for conversion";
          return;
        }
        const year = parseInt(parserArray[1], 10);
        if (year >= 50)
          this.year = 1900 + year;
        else
          this.year = 2e3 + year;
        this.month = parseInt(parserArray[2], 10);
        this.day = parseInt(parserArray[3], 10);
        this.hour = parseInt(parserArray[4], 10);
        this.minute = parseInt(parserArray[5], 10);
        this.second = parseInt(parserArray[6], 10);
      }
      toString(encoding = "iso") {
        if (encoding === "iso") {
          const outputArray = new Array(7);
          outputArray[0] = padNumber(this.year < 2e3 ? this.year - 1900 : this.year - 2e3, 2);
          outputArray[1] = padNumber(this.month, 2);
          outputArray[2] = padNumber(this.day, 2);
          outputArray[3] = padNumber(this.hour, 2);
          outputArray[4] = padNumber(this.minute, 2);
          outputArray[5] = padNumber(this.second, 2);
          outputArray[6] = "Z";
          return outputArray.join("");
        }
        return super.toString(encoding);
      }
      onAsciiEncoding() {
        return `${this.constructor.NAME} : ${this.toDate().toISOString()}`;
      }
      toJSON() {
        return {
          ...super.toJSON(),
          year: this.year,
          month: this.month,
          day: this.day,
          hour: this.hour,
          minute: this.minute,
          second: this.second
        };
      }
    };
    __name(UTCTime, "UTCTime");
    _a$6 = UTCTime;
    (() => {
      typeStore.UTCTime = _a$6;
    })();
    UTCTime.NAME = "UTCTime";
    GeneralizedTime = class extends UTCTime {
      constructor(parameters = {}) {
        var _b;
        super(parameters);
        (_b = this.millisecond) !== null && _b !== void 0 ? _b : this.millisecond = 0;
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 24;
      }
      fromDate(inputDate) {
        super.fromDate(inputDate);
        this.millisecond = inputDate.getUTCMilliseconds();
      }
      toDate() {
        return new Date(Date.UTC(this.year, this.month - 1, this.day, this.hour, this.minute, this.second, this.millisecond));
      }
      fromString(inputString) {
        let isUTC = false;
        let timeString = "";
        let dateTimeString = "";
        let fractionPart = 0;
        let parser;
        let hourDifference = 0;
        let minuteDifference = 0;
        if (inputString[inputString.length - 1] === "Z") {
          timeString = inputString.substring(0, inputString.length - 1);
          isUTC = true;
        } else {
          const number = new Number(inputString[inputString.length - 1]);
          if (isNaN(number.valueOf()))
            throw new Error("Wrong input string for conversion");
          timeString = inputString;
        }
        if (isUTC) {
          if (timeString.indexOf("+") !== -1)
            throw new Error("Wrong input string for conversion");
          if (timeString.indexOf("-") !== -1)
            throw new Error("Wrong input string for conversion");
        } else {
          let multiplier = 1;
          let differencePosition = timeString.indexOf("+");
          let differenceString = "";
          if (differencePosition === -1) {
            differencePosition = timeString.indexOf("-");
            multiplier = -1;
          }
          if (differencePosition !== -1) {
            differenceString = timeString.substring(differencePosition + 1);
            timeString = timeString.substring(0, differencePosition);
            if (differenceString.length !== 2 && differenceString.length !== 4)
              throw new Error("Wrong input string for conversion");
            let number = parseInt(differenceString.substring(0, 2), 10);
            if (isNaN(number.valueOf()))
              throw new Error("Wrong input string for conversion");
            hourDifference = multiplier * number;
            if (differenceString.length === 4) {
              number = parseInt(differenceString.substring(2, 4), 10);
              if (isNaN(number.valueOf()))
                throw new Error("Wrong input string for conversion");
              minuteDifference = multiplier * number;
            }
          }
        }
        let fractionPointPosition = timeString.indexOf(".");
        if (fractionPointPosition === -1)
          fractionPointPosition = timeString.indexOf(",");
        if (fractionPointPosition !== -1) {
          const fractionPartCheck = new Number(`0${timeString.substring(fractionPointPosition)}`);
          if (isNaN(fractionPartCheck.valueOf()))
            throw new Error("Wrong input string for conversion");
          fractionPart = fractionPartCheck.valueOf();
          dateTimeString = timeString.substring(0, fractionPointPosition);
        } else
          dateTimeString = timeString;
        switch (true) {
          case dateTimeString.length === 8:
            parser = /(\d{4})(\d{2})(\d{2})/ig;
            if (fractionPointPosition !== -1)
              throw new Error("Wrong input string for conversion");
            break;
          case dateTimeString.length === 10:
            parser = /(\d{4})(\d{2})(\d{2})(\d{2})/ig;
            if (fractionPointPosition !== -1) {
              let fractionResult = 60 * fractionPart;
              this.minute = Math.floor(fractionResult);
              fractionResult = 60 * (fractionResult - this.minute);
              this.second = Math.floor(fractionResult);
              fractionResult = 1e3 * (fractionResult - this.second);
              this.millisecond = Math.floor(fractionResult);
            }
            break;
          case dateTimeString.length === 12:
            parser = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/ig;
            if (fractionPointPosition !== -1) {
              let fractionResult = 60 * fractionPart;
              this.second = Math.floor(fractionResult);
              fractionResult = 1e3 * (fractionResult - this.second);
              this.millisecond = Math.floor(fractionResult);
            }
            break;
          case dateTimeString.length === 14:
            parser = /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/ig;
            if (fractionPointPosition !== -1) {
              const fractionResult = 1e3 * fractionPart;
              this.millisecond = Math.floor(fractionResult);
            }
            break;
          default:
            throw new Error("Wrong input string for conversion");
        }
        const parserArray = parser.exec(dateTimeString);
        if (parserArray === null)
          throw new Error("Wrong input string for conversion");
        for (let j = 1; j < parserArray.length; j++) {
          switch (j) {
            case 1:
              this.year = parseInt(parserArray[j], 10);
              break;
            case 2:
              this.month = parseInt(parserArray[j], 10);
              break;
            case 3:
              this.day = parseInt(parserArray[j], 10);
              break;
            case 4:
              this.hour = parseInt(parserArray[j], 10) + hourDifference;
              break;
            case 5:
              this.minute = parseInt(parserArray[j], 10) + minuteDifference;
              break;
            case 6:
              this.second = parseInt(parserArray[j], 10);
              break;
            default:
              throw new Error("Wrong input string for conversion");
          }
        }
        if (isUTC === false) {
          const tempDate = new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.millisecond);
          this.year = tempDate.getUTCFullYear();
          this.month = tempDate.getUTCMonth();
          this.day = tempDate.getUTCDay();
          this.hour = tempDate.getUTCHours();
          this.minute = tempDate.getUTCMinutes();
          this.second = tempDate.getUTCSeconds();
          this.millisecond = tempDate.getUTCMilliseconds();
        }
      }
      toString(encoding = "iso") {
        if (encoding === "iso") {
          const outputArray = [];
          outputArray.push(padNumber(this.year, 4));
          outputArray.push(padNumber(this.month, 2));
          outputArray.push(padNumber(this.day, 2));
          outputArray.push(padNumber(this.hour, 2));
          outputArray.push(padNumber(this.minute, 2));
          outputArray.push(padNumber(this.second, 2));
          if (this.millisecond !== 0) {
            outputArray.push(".");
            outputArray.push(padNumber(this.millisecond, 3));
          }
          outputArray.push("Z");
          return outputArray.join("");
        }
        return super.toString(encoding);
      }
      toJSON() {
        return {
          ...super.toJSON(),
          millisecond: this.millisecond
        };
      }
    };
    __name(GeneralizedTime, "GeneralizedTime");
    _a$5 = GeneralizedTime;
    (() => {
      typeStore.GeneralizedTime = _a$5;
    })();
    GeneralizedTime.NAME = "GeneralizedTime";
    DATE = class extends Utf8String {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 31;
      }
    };
    __name(DATE, "DATE");
    _a$4 = DATE;
    (() => {
      typeStore.DATE = _a$4;
    })();
    DATE.NAME = "DATE";
    TimeOfDay = class extends Utf8String {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 32;
      }
    };
    __name(TimeOfDay, "TimeOfDay");
    _a$3 = TimeOfDay;
    (() => {
      typeStore.TimeOfDay = _a$3;
    })();
    TimeOfDay.NAME = "TimeOfDay";
    DateTime = class extends Utf8String {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 33;
      }
    };
    __name(DateTime, "DateTime");
    _a$2 = DateTime;
    (() => {
      typeStore.DateTime = _a$2;
    })();
    DateTime.NAME = "DateTime";
    Duration = class extends Utf8String {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 34;
      }
    };
    __name(Duration, "Duration");
    _a$1 = Duration;
    (() => {
      typeStore.Duration = _a$1;
    })();
    Duration.NAME = "Duration";
    TIME = class extends Utf8String {
      constructor(parameters = {}) {
        super(parameters);
        this.idBlock.tagClass = 1;
        this.idBlock.tagNumber = 14;
      }
    };
    __name(TIME, "TIME");
    _a = TIME;
    (() => {
      typeStore.TIME = _a;
    })();
    TIME.NAME = "TIME";
    Any = class {
      constructor({ name = EMPTY_STRING, optional = false } = {}) {
        this.name = name;
        this.optional = optional;
      }
    };
    __name(Any, "Any");
    Choice = class extends Any {
      constructor({ value = [], ...parameters } = {}) {
        super(parameters);
        this.value = value;
      }
    };
    __name(Choice, "Choice");
    Repeated = class extends Any {
      constructor({ value = new Any(), local = false, ...parameters } = {}) {
        super(parameters);
        this.value = value;
        this.local = local;
      }
    };
    __name(Repeated, "Repeated");
    RawData = class {
      constructor({ data = EMPTY_VIEW } = {}) {
        this.dataView = BufferSourceConverter.toUint8Array(data);
      }
      get data() {
        return this.dataView.slice().buffer;
      }
      set data(value) {
        this.dataView = BufferSourceConverter.toUint8Array(value);
      }
      fromBER(inputBuffer, inputOffset, inputLength) {
        const endLength = inputOffset + inputLength;
        this.dataView = BufferSourceConverter.toUint8Array(inputBuffer).subarray(inputOffset, endLength);
        return endLength;
      }
      toBER(sizeOnly) {
        return this.dataView.slice().buffer;
      }
    };
    __name(RawData, "RawData");
    __name(compareSchema, "compareSchema");
    __name(verifySchema, "verifySchema");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/enums.js
var AsnTypeTypes, AsnPropTypes;
var init_enums = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/enums.js"() {
    (function(AsnTypeTypes2) {
      AsnTypeTypes2[AsnTypeTypes2["Sequence"] = 0] = "Sequence";
      AsnTypeTypes2[AsnTypeTypes2["Set"] = 1] = "Set";
      AsnTypeTypes2[AsnTypeTypes2["Choice"] = 2] = "Choice";
    })(AsnTypeTypes || (AsnTypeTypes = {}));
    (function(AsnPropTypes2) {
      AsnPropTypes2[AsnPropTypes2["Any"] = 1] = "Any";
      AsnPropTypes2[AsnPropTypes2["Boolean"] = 2] = "Boolean";
      AsnPropTypes2[AsnPropTypes2["OctetString"] = 3] = "OctetString";
      AsnPropTypes2[AsnPropTypes2["BitString"] = 4] = "BitString";
      AsnPropTypes2[AsnPropTypes2["Integer"] = 5] = "Integer";
      AsnPropTypes2[AsnPropTypes2["Enumerated"] = 6] = "Enumerated";
      AsnPropTypes2[AsnPropTypes2["ObjectIdentifier"] = 7] = "ObjectIdentifier";
      AsnPropTypes2[AsnPropTypes2["Utf8String"] = 8] = "Utf8String";
      AsnPropTypes2[AsnPropTypes2["BmpString"] = 9] = "BmpString";
      AsnPropTypes2[AsnPropTypes2["UniversalString"] = 10] = "UniversalString";
      AsnPropTypes2[AsnPropTypes2["NumericString"] = 11] = "NumericString";
      AsnPropTypes2[AsnPropTypes2["PrintableString"] = 12] = "PrintableString";
      AsnPropTypes2[AsnPropTypes2["TeletexString"] = 13] = "TeletexString";
      AsnPropTypes2[AsnPropTypes2["VideotexString"] = 14] = "VideotexString";
      AsnPropTypes2[AsnPropTypes2["IA5String"] = 15] = "IA5String";
      AsnPropTypes2[AsnPropTypes2["GraphicString"] = 16] = "GraphicString";
      AsnPropTypes2[AsnPropTypes2["VisibleString"] = 17] = "VisibleString";
      AsnPropTypes2[AsnPropTypes2["GeneralString"] = 18] = "GeneralString";
      AsnPropTypes2[AsnPropTypes2["CharacterString"] = 19] = "CharacterString";
      AsnPropTypes2[AsnPropTypes2["UTCTime"] = 20] = "UTCTime";
      AsnPropTypes2[AsnPropTypes2["GeneralizedTime"] = 21] = "GeneralizedTime";
      AsnPropTypes2[AsnPropTypes2["DATE"] = 22] = "DATE";
      AsnPropTypes2[AsnPropTypes2["TimeOfDay"] = 23] = "TimeOfDay";
      AsnPropTypes2[AsnPropTypes2["DateTime"] = 24] = "DateTime";
      AsnPropTypes2[AsnPropTypes2["Duration"] = 25] = "Duration";
      AsnPropTypes2[AsnPropTypes2["TIME"] = 26] = "TIME";
      AsnPropTypes2[AsnPropTypes2["Null"] = 27] = "Null";
    })(AsnPropTypes || (AsnPropTypes = {}));
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/converters.js
function createStringConverter(Asn1Type) {
  return {
    fromASN: (value) => value.valueBlock.value,
    toASN: (value) => new Asn1Type({ value })
  };
}
function defaultConverter(type) {
  switch (type) {
    case AsnPropTypes.Any:
      return AsnAnyConverter;
    case AsnPropTypes.BitString:
      return AsnBitStringConverter;
    case AsnPropTypes.BmpString:
      return AsnBmpStringConverter;
    case AsnPropTypes.Boolean:
      return AsnBooleanConverter;
    case AsnPropTypes.CharacterString:
      return AsnCharacterStringConverter;
    case AsnPropTypes.Enumerated:
      return AsnEnumeratedConverter;
    case AsnPropTypes.GeneralString:
      return AsnGeneralStringConverter;
    case AsnPropTypes.GeneralizedTime:
      return AsnGeneralizedTimeConverter;
    case AsnPropTypes.GraphicString:
      return AsnGraphicStringConverter;
    case AsnPropTypes.IA5String:
      return AsnIA5StringConverter;
    case AsnPropTypes.Integer:
      return AsnIntegerConverter;
    case AsnPropTypes.Null:
      return AsnNullConverter;
    case AsnPropTypes.NumericString:
      return AsnNumericStringConverter;
    case AsnPropTypes.ObjectIdentifier:
      return AsnObjectIdentifierConverter;
    case AsnPropTypes.OctetString:
      return AsnOctetStringConverter;
    case AsnPropTypes.PrintableString:
      return AsnPrintableStringConverter;
    case AsnPropTypes.TeletexString:
      return AsnTeletexStringConverter;
    case AsnPropTypes.UTCTime:
      return AsnUTCTimeConverter;
    case AsnPropTypes.UniversalString:
      return AsnUniversalStringConverter;
    case AsnPropTypes.Utf8String:
      return AsnUtf8StringConverter;
    case AsnPropTypes.VideotexString:
      return AsnVideotexStringConverter;
    case AsnPropTypes.VisibleString:
      return AsnVisibleStringConverter;
    default:
      return null;
  }
}
var AsnAnyConverter, AsnIntegerConverter, AsnEnumeratedConverter, AsnBitStringConverter, AsnObjectIdentifierConverter, AsnBooleanConverter, AsnOctetStringConverter, AsnUtf8StringConverter, AsnBmpStringConverter, AsnUniversalStringConverter, AsnNumericStringConverter, AsnPrintableStringConverter, AsnTeletexStringConverter, AsnVideotexStringConverter, AsnIA5StringConverter, AsnGraphicStringConverter, AsnVisibleStringConverter, AsnGeneralStringConverter, AsnCharacterStringConverter, AsnUTCTimeConverter, AsnGeneralizedTimeConverter, AsnNullConverter;
var init_converters = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/converters.js"() {
    init_index_es2();
    init_enums();
    AsnAnyConverter = {
      fromASN: (value) => value instanceof Null ? null : value.valueBeforeDecode,
      toASN: (value) => {
        if (value === null) {
          return new Null();
        }
        const schema = fromBER(value);
        if (schema.result.error) {
          throw new Error(schema.result.error);
        }
        return schema.result;
      }
    };
    AsnIntegerConverter = {
      fromASN: (value) => value.valueBlock.valueHexView.byteLength >= 4 ? value.valueBlock.toString() : value.valueBlock.valueDec,
      toASN: (value) => new Integer({ value })
    };
    AsnEnumeratedConverter = {
      fromASN: (value) => value.valueBlock.valueDec,
      toASN: (value) => new Enumerated({ value })
    };
    AsnBitStringConverter = {
      fromASN: (value) => value.valueBlock.valueHex,
      toASN: (value) => new BitString({ valueHex: value })
    };
    AsnObjectIdentifierConverter = {
      fromASN: (value) => value.valueBlock.toString(),
      toASN: (value) => new ObjectIdentifier({ value })
    };
    AsnBooleanConverter = {
      fromASN: (value) => value.valueBlock.value,
      toASN: (value) => new Boolean2({ value })
    };
    AsnOctetStringConverter = {
      fromASN: (value) => value.valueBlock.valueHex,
      toASN: (value) => new OctetString({ valueHex: value })
    };
    __name(createStringConverter, "createStringConverter");
    AsnUtf8StringConverter = createStringConverter(Utf8String);
    AsnBmpStringConverter = createStringConverter(BmpString);
    AsnUniversalStringConverter = createStringConverter(UniversalString);
    AsnNumericStringConverter = createStringConverter(NumericString);
    AsnPrintableStringConverter = createStringConverter(PrintableString);
    AsnTeletexStringConverter = createStringConverter(TeletexString);
    AsnVideotexStringConverter = createStringConverter(VideotexString);
    AsnIA5StringConverter = createStringConverter(IA5String);
    AsnGraphicStringConverter = createStringConverter(GraphicString);
    AsnVisibleStringConverter = createStringConverter(VisibleString);
    AsnGeneralStringConverter = createStringConverter(GeneralString);
    AsnCharacterStringConverter = createStringConverter(CharacterString);
    AsnUTCTimeConverter = {
      fromASN: (value) => value.toDate(),
      toASN: (value) => new UTCTime({ valueDate: value })
    };
    AsnGeneralizedTimeConverter = {
      fromASN: (value) => value.toDate(),
      toASN: (value) => new GeneralizedTime({ valueDate: value })
    };
    AsnNullConverter = {
      fromASN: (value) => null,
      toASN: (value) => {
        return new Null();
      }
    };
    __name(defaultConverter, "defaultConverter");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/types/bit_string.js
var init_bit_string = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/types/bit_string.js"() {
    init_index_es2();
    init_index_es();
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/types/octet_string.js
var init_octet_string = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/types/octet_string.js"() {
    init_index_es2();
    init_index_es();
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/types/index.js
var init_types = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/types/index.js"() {
    init_bit_string();
    init_octet_string();
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/helper.js
function isConvertible(target) {
  if (target && target.prototype) {
    if (target.prototype.toASN && target.prototype.fromASN) {
      return true;
    } else {
      return isConvertible(target.prototype);
    }
  } else {
    return !!(target && target.toASN && target.fromASN);
  }
}
function isTypeOfArray(target) {
  var _a2;
  if (target) {
    const proto = Object.getPrototypeOf(target);
    if (((_a2 = proto === null || proto === void 0 ? void 0 : proto.prototype) === null || _a2 === void 0 ? void 0 : _a2.constructor) === Array) {
      return true;
    }
    return isTypeOfArray(proto);
  }
  return false;
}
function isArrayEqual(bytes1, bytes2) {
  if (!(bytes1 && bytes2)) {
    return false;
  }
  if (bytes1.byteLength !== bytes2.byteLength) {
    return false;
  }
  const b1 = new Uint8Array(bytes1);
  const b2 = new Uint8Array(bytes2);
  for (let i = 0; i < bytes1.byteLength; i++) {
    if (b1[i] !== b2[i]) {
      return false;
    }
  }
  return true;
}
var init_helper = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/helper.js"() {
    __name(isConvertible, "isConvertible");
    __name(isTypeOfArray, "isTypeOfArray");
    __name(isArrayEqual, "isArrayEqual");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/schema.js
var AsnSchemaStorage;
var init_schema = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/schema.js"() {
    init_index_es2();
    init_enums();
    init_helper();
    AsnSchemaStorage = class {
      constructor() {
        this.items = /* @__PURE__ */ new WeakMap();
      }
      has(target) {
        return this.items.has(target);
      }
      get(target) {
        var _a2, _b, _c;
        const schema = this.items.get(target);
        if (!schema) {
          throw new Error(`Cannot get schema for '${(_c = (_b = (_a2 = target === null || target === void 0 ? void 0 : target.prototype) === null || _a2 === void 0 ? void 0 : _a2.constructor) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : target}' target`);
        }
        return schema;
      }
      cache(target) {
        const schema = this.get(target);
        if (!schema.schema) {
          schema.schema = this.create(target, true);
        }
      }
      createDefault(target) {
        const schema = {
          type: AsnTypeTypes.Sequence,
          items: {}
        };
        const parentSchema = this.findParentSchema(target);
        if (parentSchema) {
          Object.assign(schema, parentSchema);
          schema.items = Object.assign({}, schema.items, parentSchema.items);
        }
        return schema;
      }
      create(target, useNames) {
        const schema = this.items.get(target) || this.createDefault(target);
        const asn1Value = [];
        for (const key in schema.items) {
          const item = schema.items[key];
          const name = useNames ? key : "";
          let asn1Item;
          if (typeof item.type === "number") {
            const Asn1TypeName = AsnPropTypes[item.type];
            const Asn1Type = index_es_exports[Asn1TypeName];
            if (!Asn1Type) {
              throw new Error(`Cannot get ASN1 class by name '${Asn1TypeName}'`);
            }
            asn1Item = new Asn1Type({ name });
          } else if (isConvertible(item.type)) {
            const instance = new item.type();
            asn1Item = instance.toSchema(name);
          } else if (item.optional) {
            const itemSchema = this.get(item.type);
            if (itemSchema.type === AsnTypeTypes.Choice) {
              asn1Item = new Any({ name });
            } else {
              asn1Item = this.create(item.type, false);
              asn1Item.name = name;
            }
          } else {
            asn1Item = new Any({ name });
          }
          const optional = !!item.optional || item.defaultValue !== void 0;
          if (item.repeated) {
            asn1Item.name = "";
            const Container = item.repeated === "set" ? Set2 : Sequence;
            asn1Item = new Container({
              name: "",
              value: [
                new Repeated({
                  name,
                  value: asn1Item
                })
              ]
            });
          }
          if (item.context !== null && item.context !== void 0) {
            if (item.implicit) {
              if (typeof item.type === "number" || isConvertible(item.type)) {
                const Container = item.repeated ? Constructed : Primitive;
                asn1Value.push(new Container({
                  name,
                  optional,
                  idBlock: {
                    tagClass: 3,
                    tagNumber: item.context
                  }
                }));
              } else {
                this.cache(item.type);
                const isRepeated = !!item.repeated;
                let value = !isRepeated ? this.get(item.type).schema : asn1Item;
                value = value.valueBlock ? value.valueBlock.value : value.value;
                asn1Value.push(new Constructed({
                  name: !isRepeated ? name : "",
                  optional,
                  idBlock: {
                    tagClass: 3,
                    tagNumber: item.context
                  },
                  value
                }));
              }
            } else {
              asn1Value.push(new Constructed({
                optional,
                idBlock: {
                  tagClass: 3,
                  tagNumber: item.context
                },
                value: [asn1Item]
              }));
            }
          } else {
            asn1Item.optional = optional;
            asn1Value.push(asn1Item);
          }
        }
        switch (schema.type) {
          case AsnTypeTypes.Sequence:
            return new Sequence({ value: asn1Value, name: "" });
          case AsnTypeTypes.Set:
            return new Set2({ value: asn1Value, name: "" });
          case AsnTypeTypes.Choice:
            return new Choice({ value: asn1Value, name: "" });
          default:
            throw new Error(`Unsupported ASN1 type in use`);
        }
      }
      set(target, schema) {
        this.items.set(target, schema);
        return this;
      }
      findParentSchema(target) {
        const parent = target.__proto__;
        if (parent) {
          const schema = this.items.get(parent);
          return schema || this.findParentSchema(parent);
        }
        return null;
      }
    };
    __name(AsnSchemaStorage, "AsnSchemaStorage");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/storage.js
var schemaStorage;
var init_storage = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/storage.js"() {
    init_schema();
    schemaStorage = new AsnSchemaStorage();
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/decorators.js
var AsnType, AsnProp;
var init_decorators = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/decorators.js"() {
    init_converters();
    init_enums();
    init_storage();
    AsnType = /* @__PURE__ */ __name((options) => (target) => {
      let schema;
      if (!schemaStorage.has(target)) {
        schema = schemaStorage.createDefault(target);
        schemaStorage.set(target, schema);
      } else {
        schema = schemaStorage.get(target);
      }
      Object.assign(schema, options);
    }, "AsnType");
    AsnProp = /* @__PURE__ */ __name((options) => (target, propertyKey) => {
      let schema;
      if (!schemaStorage.has(target.constructor)) {
        schema = schemaStorage.createDefault(target.constructor);
        schemaStorage.set(target.constructor, schema);
      } else {
        schema = schemaStorage.get(target.constructor);
      }
      const copyOptions = Object.assign({}, options);
      if (typeof copyOptions.type === "number" && !copyOptions.converter) {
        const defaultConverter2 = defaultConverter(options.type);
        if (!defaultConverter2) {
          throw new Error(`Cannot get default converter for property '${propertyKey}' of ${target.constructor.name}`);
        }
        copyOptions.converter = defaultConverter2;
      }
      schema.items[propertyKey] = copyOptions;
    }, "AsnProp");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/errors/schema_validation.js
var AsnSchemaValidationError;
var init_schema_validation = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/errors/schema_validation.js"() {
    AsnSchemaValidationError = class extends Error {
      constructor() {
        super(...arguments);
        this.schemas = [];
      }
    };
    __name(AsnSchemaValidationError, "AsnSchemaValidationError");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/errors/index.js
var init_errors = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/errors/index.js"() {
    init_schema_validation();
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/parser.js
var AsnParser;
var init_parser = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/parser.js"() {
    init_index_es2();
    init_enums();
    init_converters();
    init_errors();
    init_helper();
    init_storage();
    AsnParser = class {
      static parse(data, target) {
        const asn1Parsed = fromBER(data);
        if (asn1Parsed.result.error) {
          throw new Error(asn1Parsed.result.error);
        }
        const res = this.fromASN(asn1Parsed.result, target);
        return res;
      }
      static fromASN(asn1Schema, target) {
        var _a2;
        try {
          if (isConvertible(target)) {
            const value = new target();
            return value.fromASN(asn1Schema);
          }
          const schema = schemaStorage.get(target);
          schemaStorage.cache(target);
          let targetSchema = schema.schema;
          if (asn1Schema.constructor === Constructed && schema.type !== AsnTypeTypes.Choice) {
            targetSchema = new Constructed({
              idBlock: {
                tagClass: 3,
                tagNumber: asn1Schema.idBlock.tagNumber
              },
              value: schema.schema.valueBlock.value
            });
            for (const key in schema.items) {
              delete asn1Schema[key];
            }
          }
          const asn1ComparedSchema = compareSchema({}, asn1Schema, targetSchema);
          if (!asn1ComparedSchema.verified) {
            throw new AsnSchemaValidationError(`Data does not match to ${target.name} ASN1 schema. ${asn1ComparedSchema.result.error}`);
          }
          const res = new target();
          if (isTypeOfArray(target)) {
            if (typeof schema.itemType === "number") {
              const converter = defaultConverter(schema.itemType);
              if (!converter) {
                throw new Error(`Cannot get default converter for array item of ${target.name} ASN1 schema`);
              }
              return target.from(asn1Schema.valueBlock.value, (element) => converter.fromASN(element));
            } else {
              return target.from(asn1Schema.valueBlock.value, (element) => this.fromASN(element, schema.itemType));
            }
          }
          for (const key in schema.items) {
            const asn1SchemaValue = asn1ComparedSchema.result[key];
            if (!asn1SchemaValue) {
              continue;
            }
            const schemaItem = schema.items[key];
            if (typeof schemaItem.type === "number" || isConvertible(schemaItem.type)) {
              const converter = (_a2 = schemaItem.converter) !== null && _a2 !== void 0 ? _a2 : isConvertible(schemaItem.type) ? new schemaItem.type() : null;
              if (!converter) {
                throw new Error("Converter is empty");
              }
              if (schemaItem.repeated) {
                if (schemaItem.implicit) {
                  const Container = schemaItem.repeated === "sequence" ? Sequence : Set2;
                  const newItem = new Container();
                  newItem.valueBlock = asn1SchemaValue.valueBlock;
                  const value = fromBER(newItem.toBER(false)).result.valueBlock.value;
                  res[key] = Array.from(value, (element) => converter.fromASN(element));
                } else {
                  res[key] = Array.from(asn1SchemaValue, (element) => converter.fromASN(element));
                }
              } else {
                let value = asn1SchemaValue;
                if (schemaItem.implicit) {
                  let newItem;
                  if (isConvertible(schemaItem.type)) {
                    newItem = new schemaItem.type().toSchema("");
                  } else {
                    const Asn1TypeName = AsnPropTypes[schemaItem.type];
                    const Asn1Type = index_es_exports[Asn1TypeName];
                    if (!Asn1Type) {
                      throw new Error(`Cannot get '${Asn1TypeName}' class from asn1js module`);
                    }
                    newItem = new Asn1Type();
                  }
                  newItem.valueBlock = value.valueBlock;
                  value = fromBER(newItem.toBER(false)).result;
                }
                res[key] = converter.fromASN(value);
              }
            } else {
              if (schemaItem.repeated) {
                res[key] = Array.from(asn1SchemaValue, (element) => this.fromASN(element, schemaItem.type));
              } else {
                res[key] = this.fromASN(asn1SchemaValue, schemaItem.type);
              }
            }
          }
          return res;
        } catch (error) {
          if (error instanceof AsnSchemaValidationError) {
            error.schemas.push(target.name);
          }
          throw error;
        }
      }
    };
    __name(AsnParser, "AsnParser");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/serializer.js
var AsnSerializer;
var init_serializer = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/serializer.js"() {
    init_index_es2();
    init_converters();
    init_enums();
    init_helper();
    init_storage();
    AsnSerializer = class {
      static serialize(obj) {
        if (obj instanceof BaseBlock) {
          return obj.toBER(false);
        }
        return this.toASN(obj).toBER(false);
      }
      static toASN(obj) {
        if (obj && isConvertible(obj.constructor)) {
          return obj.toASN();
        }
        const target = obj.constructor;
        const schema = schemaStorage.get(target);
        schemaStorage.cache(target);
        let asn1Value = [];
        if (schema.itemType) {
          if (typeof schema.itemType === "number") {
            const converter = defaultConverter(schema.itemType);
            if (!converter) {
              throw new Error(`Cannot get default converter for array item of ${target.name} ASN1 schema`);
            }
            asn1Value = obj.map((o) => converter.toASN(o));
          } else {
            asn1Value = obj.map((o) => this.toAsnItem({ type: schema.itemType }, "[]", target, o));
          }
        } else {
          for (const key in schema.items) {
            const schemaItem = schema.items[key];
            const objProp = obj[key];
            if (objProp === void 0 || schemaItem.defaultValue === objProp || typeof schemaItem.defaultValue === "object" && typeof objProp === "object" && isArrayEqual(this.serialize(schemaItem.defaultValue), this.serialize(objProp))) {
              continue;
            }
            let asn1Item = AsnSerializer.toAsnItem(schemaItem, key, target, objProp);
            if (typeof schemaItem.context === "number") {
              if (schemaItem.implicit) {
                if (!schemaItem.repeated && (typeof schemaItem.type === "number" || isConvertible(schemaItem.type))) {
                  const value = {};
                  value.valueHex = asn1Item instanceof Null ? asn1Item.valueBeforeDecode : asn1Item.valueBlock.toBER();
                  asn1Value.push(new Primitive({
                    optional: schemaItem.optional,
                    idBlock: {
                      tagClass: 3,
                      tagNumber: schemaItem.context
                    },
                    ...value
                  }));
                } else {
                  asn1Value.push(new Constructed({
                    optional: schemaItem.optional,
                    idBlock: {
                      tagClass: 3,
                      tagNumber: schemaItem.context
                    },
                    value: asn1Item.valueBlock.value
                  }));
                }
              } else {
                asn1Value.push(new Constructed({
                  optional: schemaItem.optional,
                  idBlock: {
                    tagClass: 3,
                    tagNumber: schemaItem.context
                  },
                  value: [asn1Item]
                }));
              }
            } else if (schemaItem.repeated) {
              asn1Value = asn1Value.concat(asn1Item);
            } else {
              asn1Value.push(asn1Item);
            }
          }
        }
        let asnSchema;
        switch (schema.type) {
          case AsnTypeTypes.Sequence:
            asnSchema = new Sequence({ value: asn1Value });
            break;
          case AsnTypeTypes.Set:
            asnSchema = new Set2({ value: asn1Value });
            break;
          case AsnTypeTypes.Choice:
            if (!asn1Value[0]) {
              throw new Error(`Schema '${target.name}' has wrong data. Choice cannot be empty.`);
            }
            asnSchema = asn1Value[0];
            break;
        }
        return asnSchema;
      }
      static toAsnItem(schemaItem, key, target, objProp) {
        let asn1Item;
        if (typeof schemaItem.type === "number") {
          const converter = schemaItem.converter;
          if (!converter) {
            throw new Error(`Property '${key}' doesn't have converter for type ${AsnPropTypes[schemaItem.type]} in schema '${target.name}'`);
          }
          if (schemaItem.repeated) {
            const items = Array.from(objProp, (element) => converter.toASN(element));
            const Container = schemaItem.repeated === "sequence" ? Sequence : Set2;
            asn1Item = new Container({
              value: items
            });
          } else {
            asn1Item = converter.toASN(objProp);
          }
        } else {
          if (schemaItem.repeated) {
            const items = Array.from(objProp, (element) => this.toASN(element));
            const Container = schemaItem.repeated === "sequence" ? Sequence : Set2;
            asn1Item = new Container({
              value: items
            });
          } else {
            asn1Item = this.toASN(objProp);
          }
        }
        return asn1Item;
      }
    };
    __name(AsnSerializer, "AsnSerializer");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/objects.js
var init_objects = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/objects.js"() {
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/convert.js
var AsnConvert;
var init_convert = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/convert.js"() {
    init_index_es2();
    init_index_es();
    init_parser();
    init_serializer();
    AsnConvert = class {
      static serialize(obj) {
        return AsnSerializer.serialize(obj);
      }
      static parse(data, target) {
        return AsnParser.parse(data, target);
      }
      static toString(data) {
        const buf = BufferSourceConverter.isBufferSource(data) ? BufferSourceConverter.toArrayBuffer(data) : AsnConvert.serialize(data);
        const asn = fromBER(buf);
        if (asn.offset === -1) {
          throw new Error(`Cannot decode ASN.1 data. ${asn.result.error}`);
        }
        return asn.result.toString();
      }
    };
    __name(AsnConvert, "AsnConvert");
  }
});

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/index.js
var init_es2015 = __esm({
  "../../node_modules/.pnpm/@peculiar+asn1-schema@2.2.0/node_modules/@peculiar/asn1-schema/build/es2015/index.js"() {
    init_converters();
    init_types();
    init_decorators();
    init_enums();
    init_parser();
    init_serializer();
    init_errors();
    init_objects();
    init_convert();
  }
});

// ../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/tslib.js
var require_tslib = __commonJS({
  "../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/tslib.js"(exports, module2) {
    var __extends2;
    var __assign2;
    var __rest2;
    var __decorate2;
    var __param2;
    var __metadata2;
    var __awaiter2;
    var __generator2;
    var __exportStar2;
    var __values2;
    var __read2;
    var __spread2;
    var __spreadArrays2;
    var __spreadArray2;
    var __await2;
    var __asyncGenerator2;
    var __asyncDelegator2;
    var __asyncValues2;
    var __makeTemplateObject2;
    var __importStar2;
    var __importDefault2;
    var __classPrivateFieldGet2;
    var __classPrivateFieldSet2;
    var __classPrivateFieldIn2;
    var __createBinding2;
    (function(factory) {
      var root = typeof global === "object" ? global : typeof self === "object" ? self : typeof this === "object" ? this : {};
      if (typeof define === "function" && define.amd) {
        define("tslib", ["exports"], function(exports2) {
          factory(createExporter(root, createExporter(exports2)));
        });
      } else if (typeof module2 === "object" && typeof module2.exports === "object") {
        factory(createExporter(root, createExporter(module2.exports)));
      } else {
        factory(createExporter(root));
      }
      function createExporter(exports2, previous) {
        if (exports2 !== root) {
          if (typeof Object.create === "function") {
            Object.defineProperty(exports2, "__esModule", { value: true });
          } else {
            exports2.__esModule = true;
          }
        }
        return function(id, v) {
          return exports2[id] = previous ? previous(id, v) : v;
        };
      }
      __name(createExporter, "createExporter");
    })(function(exporter) {
      var extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d, b) {
        d.__proto__ = b;
      } || function(d, b) {
        for (var p in b)
          if (Object.prototype.hasOwnProperty.call(b, p))
            d[p] = b[p];
      };
      __extends2 = /* @__PURE__ */ __name(function(d, b) {
        if (typeof b !== "function" && b !== null)
          throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() {
          this.constructor = d;
        }
        __name(__, "__");
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
      }, "__extends");
      __assign2 = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s)
            if (Object.prototype.hasOwnProperty.call(s, p))
              t[p] = s[p];
        }
        return t;
      };
      __rest2 = /* @__PURE__ */ __name(function(s, e) {
        var t = {};
        for (var p in s)
          if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
          for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
              t[p[i]] = s[p[i]];
          }
        return t;
      }, "__rest");
      __decorate2 = /* @__PURE__ */ __name(function(decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
          r = Reflect.decorate(decorators, target, key, desc);
        else
          for (var i = decorators.length - 1; i >= 0; i--)
            if (d = decorators[i])
              r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
      }, "__decorate");
      __param2 = /* @__PURE__ */ __name(function(paramIndex, decorator) {
        return function(target, key) {
          decorator(target, key, paramIndex);
        };
      }, "__param");
      __metadata2 = /* @__PURE__ */ __name(function(metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
          return Reflect.metadata(metadataKey, metadataValue);
      }, "__metadata");
      __awaiter2 = /* @__PURE__ */ __name(function(thisArg, _arguments, P, generator) {
        function adopt(value) {
          return value instanceof P ? value : new P(function(resolve) {
            resolve(value);
          });
        }
        __name(adopt, "adopt");
        return new (P || (P = Promise))(function(resolve, reject) {
          function fulfilled(value) {
            try {
              step(generator.next(value));
            } catch (e) {
              reject(e);
            }
          }
          __name(fulfilled, "fulfilled");
          function rejected(value) {
            try {
              step(generator["throw"](value));
            } catch (e) {
              reject(e);
            }
          }
          __name(rejected, "rejected");
          function step(result) {
            result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
          }
          __name(step, "step");
          step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
      }, "__awaiter");
      __generator2 = /* @__PURE__ */ __name(function(thisArg, body) {
        var _ = { label: 0, sent: function() {
          if (t[0] & 1)
            throw t[1];
          return t[1];
        }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() {
          return this;
        }), g;
        function verb(n) {
          return function(v) {
            return step([n, v]);
          };
        }
        __name(verb, "verb");
        function step(op) {
          if (f)
            throw new TypeError("Generator is already executing.");
          while (_)
            try {
              if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                return t;
              if (y = 0, t)
                op = [op[0] & 2, t.value];
              switch (op[0]) {
                case 0:
                case 1:
                  t = op;
                  break;
                case 4:
                  _.label++;
                  return { value: op[1], done: false };
                case 5:
                  _.label++;
                  y = op[1];
                  op = [0];
                  continue;
                case 7:
                  op = _.ops.pop();
                  _.trys.pop();
                  continue;
                default:
                  if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                    _ = 0;
                    continue;
                  }
                  if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                    _.label = op[1];
                    break;
                  }
                  if (op[0] === 6 && _.label < t[1]) {
                    _.label = t[1];
                    t = op;
                    break;
                  }
                  if (t && _.label < t[2]) {
                    _.label = t[2];
                    _.ops.push(op);
                    break;
                  }
                  if (t[2])
                    _.ops.pop();
                  _.trys.pop();
                  continue;
              }
              op = body.call(thisArg, _);
            } catch (e) {
              op = [6, e];
              y = 0;
            } finally {
              f = t = 0;
            }
          if (op[0] & 5)
            throw op[1];
          return { value: op[0] ? op[1] : void 0, done: true };
        }
        __name(step, "step");
      }, "__generator");
      __exportStar2 = /* @__PURE__ */ __name(function(m, o) {
        for (var p in m)
          if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p))
            __createBinding2(o, m, p);
      }, "__exportStar");
      __createBinding2 = Object.create ? function(o, m, k, k2) {
        if (k2 === void 0)
          k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = { enumerable: true, get: function() {
            return m[k];
          } };
        }
        Object.defineProperty(o, k2, desc);
      } : function(o, m, k, k2) {
        if (k2 === void 0)
          k2 = k;
        o[k2] = m[k];
      };
      __values2 = /* @__PURE__ */ __name(function(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m)
          return m.call(o);
        if (o && typeof o.length === "number")
          return {
            next: function() {
              if (o && i >= o.length)
                o = void 0;
              return { value: o && o[i++], done: !o };
            }
          };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
      }, "__values");
      __read2 = /* @__PURE__ */ __name(function(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m)
          return o;
        var i = m.call(o), r, ar = [], e;
        try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done)
            ar.push(r.value);
        } catch (error) {
          e = { error };
        } finally {
          try {
            if (r && !r.done && (m = i["return"]))
              m.call(i);
          } finally {
            if (e)
              throw e.error;
          }
        }
        return ar;
      }, "__read");
      __spread2 = /* @__PURE__ */ __name(function() {
        for (var ar = [], i = 0; i < arguments.length; i++)
          ar = ar.concat(__read2(arguments[i]));
        return ar;
      }, "__spread");
      __spreadArrays2 = /* @__PURE__ */ __name(function() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++)
          s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
          for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
        return r;
      }, "__spreadArrays");
      __spreadArray2 = /* @__PURE__ */ __name(function(to, from, pack) {
        if (pack || arguments.length === 2)
          for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
              if (!ar)
                ar = Array.prototype.slice.call(from, 0, i);
              ar[i] = from[i];
            }
          }
        return to.concat(ar || Array.prototype.slice.call(from));
      }, "__spreadArray");
      __await2 = /* @__PURE__ */ __name(function(v) {
        return this instanceof __await2 ? (this.v = v, this) : new __await2(v);
      }, "__await");
      __asyncGenerator2 = /* @__PURE__ */ __name(function(thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator)
          throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
          return this;
        }, i;
        function verb(n) {
          if (g[n])
            i[n] = function(v) {
              return new Promise(function(a, b) {
                q.push([n, v, a, b]) > 1 || resume(n, v);
              });
            };
        }
        __name(verb, "verb");
        function resume(n, v) {
          try {
            step(g[n](v));
          } catch (e) {
            settle(q[0][3], e);
          }
        }
        __name(resume, "resume");
        function step(r) {
          r.value instanceof __await2 ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
        }
        __name(step, "step");
        function fulfill(value) {
          resume("next", value);
        }
        __name(fulfill, "fulfill");
        function reject(value) {
          resume("throw", value);
        }
        __name(reject, "reject");
        function settle(f, v) {
          if (f(v), q.shift(), q.length)
            resume(q[0][0], q[0][1]);
        }
        __name(settle, "settle");
      }, "__asyncGenerator");
      __asyncDelegator2 = /* @__PURE__ */ __name(function(o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function(e) {
          throw e;
        }), verb("return"), i[Symbol.iterator] = function() {
          return this;
        }, i;
        function verb(n, f) {
          i[n] = o[n] ? function(v) {
            return (p = !p) ? { value: __await2(o[n](v)), done: n === "return" } : f ? f(v) : v;
          } : f;
        }
        __name(verb, "verb");
      }, "__asyncDelegator");
      __asyncValues2 = /* @__PURE__ */ __name(function(o) {
        if (!Symbol.asyncIterator)
          throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values2 === "function" ? __values2(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
          return this;
        }, i);
        function verb(n) {
          i[n] = o[n] && function(v) {
            return new Promise(function(resolve, reject) {
              v = o[n](v), settle(resolve, reject, v.done, v.value);
            });
          };
        }
        __name(verb, "verb");
        function settle(resolve, reject, d, v) {
          Promise.resolve(v).then(function(v2) {
            resolve({ value: v2, done: d });
          }, reject);
        }
        __name(settle, "settle");
      }, "__asyncValues");
      __makeTemplateObject2 = /* @__PURE__ */ __name(function(cooked, raw) {
        if (Object.defineProperty) {
          Object.defineProperty(cooked, "raw", { value: raw });
        } else {
          cooked.raw = raw;
        }
        return cooked;
      }, "__makeTemplateObject");
      var __setModuleDefault = Object.create ? function(o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      } : function(o, v) {
        o["default"] = v;
      };
      __importStar2 = /* @__PURE__ */ __name(function(mod) {
        if (mod && mod.__esModule)
          return mod;
        var result = {};
        if (mod != null) {
          for (var k in mod)
            if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
              __createBinding2(result, mod, k);
        }
        __setModuleDefault(result, mod);
        return result;
      }, "__importStar");
      __importDefault2 = /* @__PURE__ */ __name(function(mod) {
        return mod && mod.__esModule ? mod : { "default": mod };
      }, "__importDefault");
      __classPrivateFieldGet2 = /* @__PURE__ */ __name(function(receiver, state, kind, f) {
        if (kind === "a" && !f)
          throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
          throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
      }, "__classPrivateFieldGet");
      __classPrivateFieldSet2 = /* @__PURE__ */ __name(function(receiver, state, value, kind, f) {
        if (kind === "m")
          throw new TypeError("Private method is not writable");
        if (kind === "a" && !f)
          throw new TypeError("Private accessor was defined without a setter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
          throw new TypeError("Cannot write private member to an object whose class did not declare it");
        return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
      }, "__classPrivateFieldSet");
      __classPrivateFieldIn2 = /* @__PURE__ */ __name(function(state, receiver) {
        if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function")
          throw new TypeError("Cannot use 'in' operator on non-object");
        return typeof state === "function" ? receiver === state : state.has(receiver);
      }, "__classPrivateFieldIn");
      exporter("__extends", __extends2);
      exporter("__assign", __assign2);
      exporter("__rest", __rest2);
      exporter("__decorate", __decorate2);
      exporter("__param", __param2);
      exporter("__metadata", __metadata2);
      exporter("__awaiter", __awaiter2);
      exporter("__generator", __generator2);
      exporter("__exportStar", __exportStar2);
      exporter("__createBinding", __createBinding2);
      exporter("__values", __values2);
      exporter("__read", __read2);
      exporter("__spread", __spread2);
      exporter("__spreadArrays", __spreadArrays2);
      exporter("__spreadArray", __spreadArray2);
      exporter("__await", __await2);
      exporter("__asyncGenerator", __asyncGenerator2);
      exporter("__asyncDelegator", __asyncDelegator2);
      exporter("__asyncValues", __asyncValues2);
      exporter("__makeTemplateObject", __makeTemplateObject2);
      exporter("__importStar", __importStar2);
      exporter("__importDefault", __importDefault2);
      exporter("__classPrivateFieldGet", __classPrivateFieldGet2);
      exporter("__classPrivateFieldSet", __classPrivateFieldSet2);
      exporter("__classPrivateFieldIn", __classPrivateFieldIn2);
    });
  }
});

// ../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/modules/index.js
var import_tslib, __extends, __assign, __rest, __decorate, __param, __metadata, __awaiter, __generator, __exportStar, __createBinding, __values, __read, __spread, __spreadArrays, __spreadArray, __await, __asyncGenerator, __asyncDelegator, __asyncValues, __makeTemplateObject, __importStar, __importDefault, __classPrivateFieldGet, __classPrivateFieldSet, __classPrivateFieldIn;
var init_modules = __esm({
  "../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/modules/index.js"() {
    import_tslib = __toESM(require_tslib(), 1);
    ({
      __extends,
      __assign,
      __rest,
      __decorate,
      __param,
      __metadata,
      __awaiter,
      __generator,
      __exportStar,
      __createBinding,
      __values,
      __read,
      __spread,
      __spreadArrays,
      __spreadArray,
      __await,
      __asyncGenerator,
      __asyncDelegator,
      __asyncValues,
      __makeTemplateObject,
      __importStar,
      __importDefault,
      __classPrivateFieldGet,
      __classPrivateFieldSet,
      __classPrivateFieldIn
    } = import_tslib.default);
  }
});

// ../../node_modules/.pnpm/@peculiar+json-schema@1.1.12/node_modules/@peculiar/json-schema/build/index.es.js
function checkType(value, type) {
  switch (type) {
    case JsonPropTypes.Boolean:
      return typeof value === "boolean";
    case JsonPropTypes.Number:
      return typeof value === "number";
    case JsonPropTypes.String:
      return typeof value === "string";
  }
  return true;
}
function throwIfTypeIsWrong(value, type) {
  if (!checkType(value, type)) {
    throw new TypeError(`Value must be ${JsonPropTypes[type]}`);
  }
}
function isConvertible2(target) {
  if (target && target.prototype) {
    if (target.prototype.toJSON && target.prototype.fromJSON) {
      return true;
    } else {
      return isConvertible2(target.prototype);
    }
  } else {
    return !!(target && target.toJSON && target.fromJSON);
  }
}
function getValidations(item) {
  const validations = [];
  if (item.pattern) {
    validations.push(new PatternValidation(item.pattern));
  }
  if (item.type === JsonPropTypes.Number || item.type === JsonPropTypes.Any) {
    if (item.minInclusive !== void 0 || item.maxInclusive !== void 0) {
      validations.push(new InclusiveValidation(item.minInclusive, item.maxInclusive));
    }
    if (item.minExclusive !== void 0 || item.maxExclusive !== void 0) {
      validations.push(new ExclusiveValidation(item.minExclusive, item.maxExclusive));
    }
    if (item.enumeration !== void 0) {
      validations.push(new EnumerationValidation(item.enumeration));
    }
  }
  if (item.type === JsonPropTypes.String || item.repeated || item.type === JsonPropTypes.Any) {
    if (item.length !== void 0 || item.minLength !== void 0 || item.maxLength !== void 0) {
      validations.push(new LengthValidation(item.length, item.minLength, item.maxLength));
    }
  }
  return validations;
}
var JsonError, TransformError, ParserError, ValidationError, SerializerError, KeyError, JsonPropTypes, JsonSchemaStorage, DEFAULT_SCHEMA, schemaStorage2, PatternValidation, InclusiveValidation, ExclusiveValidation, LengthValidation, EnumerationValidation, JsonTransform, JsonSerializer, JsonParser, JsonProp;
var init_index_es3 = __esm({
  "../../node_modules/.pnpm/@peculiar+json-schema@1.1.12/node_modules/@peculiar/json-schema/build/index.es.js"() {
    JsonError = class extends Error {
      constructor(message, innerError) {
        super(innerError ? `${message}. See the inner exception for more details.` : message);
        this.message = message;
        this.innerError = innerError;
      }
    };
    __name(JsonError, "JsonError");
    TransformError = class extends JsonError {
      constructor(schema, message, innerError) {
        super(message, innerError);
        this.schema = schema;
      }
    };
    __name(TransformError, "TransformError");
    ParserError = class extends TransformError {
      constructor(schema, message, innerError) {
        super(schema, `JSON doesn't match to '${schema.target.name}' schema. ${message}`, innerError);
      }
    };
    __name(ParserError, "ParserError");
    ValidationError = class extends JsonError {
    };
    __name(ValidationError, "ValidationError");
    SerializerError = class extends JsonError {
      constructor(schemaName, message, innerError) {
        super(`Cannot serialize by '${schemaName}' schema. ${message}`, innerError);
        this.schemaName = schemaName;
      }
    };
    __name(SerializerError, "SerializerError");
    KeyError = class extends ParserError {
      constructor(schema, keys, errors = {}) {
        super(schema, "Some keys doesn't match to schema");
        this.keys = keys;
        this.errors = errors;
      }
    };
    __name(KeyError, "KeyError");
    (function(JsonPropTypes2) {
      JsonPropTypes2[JsonPropTypes2["Any"] = 0] = "Any";
      JsonPropTypes2[JsonPropTypes2["Boolean"] = 1] = "Boolean";
      JsonPropTypes2[JsonPropTypes2["Number"] = 2] = "Number";
      JsonPropTypes2[JsonPropTypes2["String"] = 3] = "String";
    })(JsonPropTypes || (JsonPropTypes = {}));
    __name(checkType, "checkType");
    __name(throwIfTypeIsWrong, "throwIfTypeIsWrong");
    __name(isConvertible2, "isConvertible");
    JsonSchemaStorage = class {
      constructor() {
        this.items = /* @__PURE__ */ new Map();
      }
      has(target) {
        return this.items.has(target) || !!this.findParentSchema(target);
      }
      get(target) {
        const schema = this.items.get(target) || this.findParentSchema(target);
        if (!schema) {
          throw new Error("Cannot get schema for current target");
        }
        return schema;
      }
      create(target) {
        const schema = { names: {} };
        const parentSchema = this.findParentSchema(target);
        if (parentSchema) {
          Object.assign(schema, parentSchema);
          schema.names = {};
          for (const name in parentSchema.names) {
            schema.names[name] = Object.assign({}, parentSchema.names[name]);
          }
        }
        schema.target = target;
        return schema;
      }
      set(target, schema) {
        this.items.set(target, schema);
        return this;
      }
      findParentSchema(target) {
        const parent = target.__proto__;
        if (parent) {
          const schema = this.items.get(parent);
          return schema || this.findParentSchema(parent);
        }
        return null;
      }
    };
    __name(JsonSchemaStorage, "JsonSchemaStorage");
    DEFAULT_SCHEMA = "default";
    schemaStorage2 = new JsonSchemaStorage();
    PatternValidation = class {
      constructor(pattern) {
        this.pattern = new RegExp(pattern);
      }
      validate(value) {
        const pattern = new RegExp(this.pattern.source, this.pattern.flags);
        if (typeof value !== "string") {
          throw new ValidationError("Incoming value must be string");
        }
        if (!pattern.exec(value)) {
          throw new ValidationError(`Value doesn't match to pattern '${pattern.toString()}'`);
        }
      }
    };
    __name(PatternValidation, "PatternValidation");
    InclusiveValidation = class {
      constructor(min = Number.MIN_VALUE, max = Number.MAX_VALUE) {
        this.min = min;
        this.max = max;
      }
      validate(value) {
        throwIfTypeIsWrong(value, JsonPropTypes.Number);
        if (!(this.min <= value && value <= this.max)) {
          const min = this.min === Number.MIN_VALUE ? "MIN" : this.min;
          const max = this.max === Number.MAX_VALUE ? "MAX" : this.max;
          throw new ValidationError(`Value doesn't match to diapason [${min},${max}]`);
        }
      }
    };
    __name(InclusiveValidation, "InclusiveValidation");
    ExclusiveValidation = class {
      constructor(min = Number.MIN_VALUE, max = Number.MAX_VALUE) {
        this.min = min;
        this.max = max;
      }
      validate(value) {
        throwIfTypeIsWrong(value, JsonPropTypes.Number);
        if (!(this.min < value && value < this.max)) {
          const min = this.min === Number.MIN_VALUE ? "MIN" : this.min;
          const max = this.max === Number.MAX_VALUE ? "MAX" : this.max;
          throw new ValidationError(`Value doesn't match to diapason (${min},${max})`);
        }
      }
    };
    __name(ExclusiveValidation, "ExclusiveValidation");
    LengthValidation = class {
      constructor(length, minLength, maxLength) {
        this.length = length;
        this.minLength = minLength;
        this.maxLength = maxLength;
      }
      validate(value) {
        if (this.length !== void 0) {
          if (value.length !== this.length) {
            throw new ValidationError(`Value length must be exactly ${this.length}.`);
          }
          return;
        }
        if (this.minLength !== void 0) {
          if (value.length < this.minLength) {
            throw new ValidationError(`Value length must be more than ${this.minLength}.`);
          }
        }
        if (this.maxLength !== void 0) {
          if (value.length > this.maxLength) {
            throw new ValidationError(`Value length must be less than ${this.maxLength}.`);
          }
        }
      }
    };
    __name(LengthValidation, "LengthValidation");
    EnumerationValidation = class {
      constructor(enumeration) {
        this.enumeration = enumeration;
      }
      validate(value) {
        throwIfTypeIsWrong(value, JsonPropTypes.String);
        if (!this.enumeration.includes(value)) {
          throw new ValidationError(`Value must be one of ${this.enumeration.map((v) => `'${v}'`).join(", ")}`);
        }
      }
    };
    __name(EnumerationValidation, "EnumerationValidation");
    JsonTransform = class {
      static checkValues(data, schemaItem) {
        const values = Array.isArray(data) ? data : [data];
        for (const value of values) {
          for (const validation of schemaItem.validations) {
            if (validation instanceof LengthValidation && schemaItem.repeated) {
              validation.validate(data);
            } else {
              validation.validate(value);
            }
          }
        }
      }
      static checkTypes(value, schemaItem) {
        if (schemaItem.repeated && !Array.isArray(value)) {
          throw new TypeError("Value must be Array");
        }
        if (typeof schemaItem.type === "number") {
          const values = Array.isArray(value) ? value : [value];
          for (const v of values) {
            throwIfTypeIsWrong(v, schemaItem.type);
          }
        }
      }
      static getSchemaByName(schema, name = DEFAULT_SCHEMA) {
        return { ...schema.names[DEFAULT_SCHEMA], ...schema.names[name] };
      }
    };
    __name(JsonTransform, "JsonTransform");
    JsonSerializer = class extends JsonTransform {
      static serialize(obj, options, replacer, space) {
        const json = this.toJSON(obj, options);
        return JSON.stringify(json, replacer, space);
      }
      static toJSON(obj, options = {}) {
        let res;
        let targetSchema = options.targetSchema;
        const schemaName = options.schemaName || DEFAULT_SCHEMA;
        if (isConvertible2(obj)) {
          return obj.toJSON();
        }
        if (Array.isArray(obj)) {
          res = [];
          for (const item of obj) {
            res.push(this.toJSON(item, options));
          }
        } else if (typeof obj === "object") {
          if (targetSchema && !schemaStorage2.has(targetSchema)) {
            throw new JsonError("Cannot get schema for `targetSchema` param");
          }
          targetSchema = targetSchema || obj.constructor;
          if (schemaStorage2.has(targetSchema)) {
            const schema = schemaStorage2.get(targetSchema);
            res = {};
            const namedSchema = this.getSchemaByName(schema, schemaName);
            for (const key in namedSchema) {
              try {
                const item = namedSchema[key];
                const objItem = obj[key];
                let value;
                if (item.optional && objItem === void 0 || item.defaultValue !== void 0 && objItem === item.defaultValue) {
                  continue;
                }
                if (!item.optional && objItem === void 0) {
                  throw new SerializerError(targetSchema.name, `Property '${key}' is required.`);
                }
                if (typeof item.type === "number") {
                  if (item.converter) {
                    if (item.repeated) {
                      value = objItem.map((el) => item.converter.toJSON(el, obj));
                    } else {
                      value = item.converter.toJSON(objItem, obj);
                    }
                  } else {
                    value = objItem;
                  }
                } else {
                  if (item.repeated) {
                    value = objItem.map((el) => this.toJSON(el, { schemaName }));
                  } else {
                    value = this.toJSON(objItem, { schemaName });
                  }
                }
                this.checkTypes(value, item);
                this.checkValues(value, item);
                res[item.name || key] = value;
              } catch (e) {
                if (e instanceof SerializerError) {
                  throw e;
                } else {
                  throw new SerializerError(schema.target.name, `Property '${key}' is wrong. ${e.message}`, e);
                }
              }
            }
          } else {
            res = {};
            for (const key in obj) {
              res[key] = this.toJSON(obj[key], { schemaName });
            }
          }
        } else {
          res = obj;
        }
        return res;
      }
    };
    __name(JsonSerializer, "JsonSerializer");
    JsonParser = class extends JsonTransform {
      static parse(data, options) {
        const obj = JSON.parse(data);
        return this.fromJSON(obj, options);
      }
      static fromJSON(target, options) {
        const targetSchema = options.targetSchema;
        const schemaName = options.schemaName || DEFAULT_SCHEMA;
        const obj = new targetSchema();
        if (isConvertible2(obj)) {
          return obj.fromJSON(target);
        }
        const schema = schemaStorage2.get(targetSchema);
        const namedSchema = this.getSchemaByName(schema, schemaName);
        const keyErrors = {};
        if (options.strictProperty && !Array.isArray(target)) {
          JsonParser.checkStrictProperty(target, namedSchema, schema);
        }
        for (const key in namedSchema) {
          try {
            const item = namedSchema[key];
            const name = item.name || key;
            const value = target[name];
            if (value === void 0 && (item.optional || item.defaultValue !== void 0)) {
              continue;
            }
            if (!item.optional && value === void 0) {
              throw new ParserError(schema, `Property '${name}' is required.`);
            }
            this.checkTypes(value, item);
            this.checkValues(value, item);
            if (typeof item.type === "number") {
              if (item.converter) {
                if (item.repeated) {
                  obj[key] = value.map((el) => item.converter.fromJSON(el, obj));
                } else {
                  obj[key] = item.converter.fromJSON(value, obj);
                }
              } else {
                obj[key] = value;
              }
            } else {
              const newOptions = {
                ...options,
                targetSchema: item.type,
                schemaName
              };
              if (item.repeated) {
                obj[key] = value.map((el) => this.fromJSON(el, newOptions));
              } else {
                obj[key] = this.fromJSON(value, newOptions);
              }
            }
          } catch (e) {
            if (!(e instanceof ParserError)) {
              e = new ParserError(schema, `Property '${key}' is wrong. ${e.message}`, e);
            }
            if (options.strictAllKeys) {
              keyErrors[key] = e;
            } else {
              throw e;
            }
          }
        }
        const keys = Object.keys(keyErrors);
        if (keys.length) {
          throw new KeyError(schema, keys, keyErrors);
        }
        return obj;
      }
      static checkStrictProperty(target, namedSchema, schema) {
        const jsonProps = Object.keys(target);
        const schemaProps = Object.keys(namedSchema);
        const keys = [];
        for (const key of jsonProps) {
          if (schemaProps.indexOf(key) === -1) {
            keys.push(key);
          }
        }
        if (keys.length) {
          throw new KeyError(schema, keys);
        }
      }
    };
    __name(JsonParser, "JsonParser");
    __name(getValidations, "getValidations");
    JsonProp = /* @__PURE__ */ __name((options = {}) => (target, propertyKey) => {
      const errorMessage = `Cannot set type for ${propertyKey} property of ${target.constructor.name} schema`;
      let schema;
      if (!schemaStorage2.has(target.constructor)) {
        schema = schemaStorage2.create(target.constructor);
        schemaStorage2.set(target.constructor, schema);
      } else {
        schema = schemaStorage2.get(target.constructor);
        if (schema.target !== target.constructor) {
          schema = schemaStorage2.create(target.constructor);
          schemaStorage2.set(target.constructor, schema);
        }
      }
      const defaultSchema = {
        type: JsonPropTypes.Any,
        validations: []
      };
      const copyOptions = Object.assign(defaultSchema, options);
      copyOptions.validations = getValidations(copyOptions);
      if (typeof copyOptions.type !== "number") {
        if (!schemaStorage2.has(copyOptions.type) && !isConvertible2(copyOptions.type)) {
          throw new Error(`${errorMessage}. Assigning type doesn't have schema.`);
        }
      }
      let schemaNames;
      if (Array.isArray(options.schema)) {
        schemaNames = options.schema;
      } else {
        schemaNames = [options.schema || DEFAULT_SCHEMA];
      }
      for (const schemaName of schemaNames) {
        if (!schema.names[schemaName]) {
          schema.names[schemaName] = {};
        }
        const namedSchema = schema.names[schemaName];
        namedSchema[propertyKey] = copyOptions;
      }
    }, "JsonProp");
  }
});

// ../../node_modules/.pnpm/webcrypto-core@1.7.5/node_modules/webcrypto-core/build/webcrypto-core.es.js
function isJWK(data) {
  return typeof data === "object" && "kty" in data;
}
var CryptoError, AlgorithmError, UnsupportedOperationError, OperationError, RequiredPropertyError, ProviderCrypto, AesProvider, AesCbcProvider, AesCmacProvider, AesCtrProvider, AesEcbProvider, AesGcmProvider, AesKwProvider, DesProvider, RsaProvider, RsaSsaProvider, RsaPssProvider, RsaOaepProvider, EllipticProvider, EcdsaProvider, KEY_TYPES, CryptoKey, EcdhProvider, EcdhEsProvider, EdDsaProvider, ObjectIdentifier2, AlgorithmIdentifier, PrivateKeyInfo, PublicKeyInfo, JsonBase64UrlArrayBufferConverter, AsnIntegerArrayBufferConverter, RsaPrivateKey, RsaPublicKey, EcPublicKey, EcPrivateKey, AsnIntegerWithoutPaddingConverter, index$2, EcUtils, EcDsaSignature, OneAsymmetricKey, EdPrivateKey, EdPublicKey, CurvePrivateKey, idSecp256r1, idEllipticCurve, idSecp384r1, idSecp521r1, idSecp256k1, idVersionOne, idBrainpoolP160r1, idBrainpoolP160t1, idBrainpoolP192r1, idBrainpoolP192t1, idBrainpoolP224r1, idBrainpoolP224t1, idBrainpoolP256r1, idBrainpoolP256t1, idBrainpoolP320r1, idBrainpoolP320t1, idBrainpoolP384r1, idBrainpoolP384t1, idBrainpoolP512r1, idBrainpoolP512t1, idX25519, idX448, idEd25519, idEd448, index$1, EcCurves, HmacProvider, Pbkdf2Provider, HkdfProvider, ShakeProvider, Shake128Provider, Shake256Provider, Crypto, ProviderStorage, SubtleCrypto;
var init_webcrypto_core_es = __esm({
  "../../node_modules/.pnpm/webcrypto-core@1.7.5/node_modules/webcrypto-core/build/webcrypto-core.es.js"() {
    init_index_es();
    init_index_es();
    init_es2015();
    init_modules();
    init_index_es3();
    init_index_es2();
    CryptoError = class extends Error {
    };
    __name(CryptoError, "CryptoError");
    AlgorithmError = class extends CryptoError {
    };
    __name(AlgorithmError, "AlgorithmError");
    UnsupportedOperationError = class extends CryptoError {
      constructor(methodName) {
        super(`Unsupported operation: ${methodName ? `${methodName}` : ""}`);
      }
    };
    __name(UnsupportedOperationError, "UnsupportedOperationError");
    OperationError = class extends CryptoError {
    };
    __name(OperationError, "OperationError");
    RequiredPropertyError = class extends CryptoError {
      constructor(propName) {
        super(`${propName}: Missing required property`);
      }
    };
    __name(RequiredPropertyError, "RequiredPropertyError");
    __name(isJWK, "isJWK");
    ProviderCrypto = class {
      async digest(...args) {
        this.checkDigest.apply(this, args);
        return this.onDigest.apply(this, args);
      }
      checkDigest(algorithm, data) {
        this.checkAlgorithmName(algorithm);
      }
      async onDigest(algorithm, data) {
        throw new UnsupportedOperationError("digest");
      }
      async generateKey(...args) {
        this.checkGenerateKey.apply(this, args);
        return this.onGenerateKey.apply(this, args);
      }
      checkGenerateKey(algorithm, extractable, keyUsages, ...args) {
        this.checkAlgorithmName(algorithm);
        this.checkGenerateKeyParams(algorithm);
        if (!(keyUsages && keyUsages.length)) {
          throw new TypeError(`Usages cannot be empty when creating a key.`);
        }
        let allowedUsages;
        if (Array.isArray(this.usages)) {
          allowedUsages = this.usages;
        } else {
          allowedUsages = this.usages.privateKey.concat(this.usages.publicKey);
        }
        this.checkKeyUsages(keyUsages, allowedUsages);
      }
      checkGenerateKeyParams(algorithm) {
      }
      async onGenerateKey(algorithm, extractable, keyUsages, ...args) {
        throw new UnsupportedOperationError("generateKey");
      }
      async sign(...args) {
        this.checkSign.apply(this, args);
        return this.onSign.apply(this, args);
      }
      checkSign(algorithm, key, data, ...args) {
        this.checkAlgorithmName(algorithm);
        this.checkAlgorithmParams(algorithm);
        this.checkCryptoKey(key, "sign");
      }
      async onSign(algorithm, key, data, ...args) {
        throw new UnsupportedOperationError("sign");
      }
      async verify(...args) {
        this.checkVerify.apply(this, args);
        return this.onVerify.apply(this, args);
      }
      checkVerify(algorithm, key, signature, data, ...args) {
        this.checkAlgorithmName(algorithm);
        this.checkAlgorithmParams(algorithm);
        this.checkCryptoKey(key, "verify");
      }
      async onVerify(algorithm, key, signature, data, ...args) {
        throw new UnsupportedOperationError("verify");
      }
      async encrypt(...args) {
        this.checkEncrypt.apply(this, args);
        return this.onEncrypt.apply(this, args);
      }
      checkEncrypt(algorithm, key, data, options = {}, ...args) {
        this.checkAlgorithmName(algorithm);
        this.checkAlgorithmParams(algorithm);
        this.checkCryptoKey(key, options.keyUsage ? "encrypt" : void 0);
      }
      async onEncrypt(algorithm, key, data, ...args) {
        throw new UnsupportedOperationError("encrypt");
      }
      async decrypt(...args) {
        this.checkDecrypt.apply(this, args);
        return this.onDecrypt.apply(this, args);
      }
      checkDecrypt(algorithm, key, data, options = {}, ...args) {
        this.checkAlgorithmName(algorithm);
        this.checkAlgorithmParams(algorithm);
        this.checkCryptoKey(key, options.keyUsage ? "decrypt" : void 0);
      }
      async onDecrypt(algorithm, key, data, ...args) {
        throw new UnsupportedOperationError("decrypt");
      }
      async deriveBits(...args) {
        this.checkDeriveBits.apply(this, args);
        return this.onDeriveBits.apply(this, args);
      }
      checkDeriveBits(algorithm, baseKey, length, options = {}, ...args) {
        this.checkAlgorithmName(algorithm);
        this.checkAlgorithmParams(algorithm);
        this.checkCryptoKey(baseKey, options.keyUsage ? "deriveBits" : void 0);
        if (length % 8 !== 0) {
          throw new OperationError("length: Is not multiple of 8");
        }
      }
      async onDeriveBits(algorithm, baseKey, length, ...args) {
        throw new UnsupportedOperationError("deriveBits");
      }
      async exportKey(...args) {
        this.checkExportKey.apply(this, args);
        return this.onExportKey.apply(this, args);
      }
      checkExportKey(format, key, ...args) {
        this.checkKeyFormat(format);
        this.checkCryptoKey(key);
        if (!key.extractable) {
          throw new CryptoError("key: Is not extractable");
        }
      }
      async onExportKey(format, key, ...args) {
        throw new UnsupportedOperationError("exportKey");
      }
      async importKey(...args) {
        this.checkImportKey.apply(this, args);
        return this.onImportKey.apply(this, args);
      }
      checkImportKey(format, keyData, algorithm, extractable, keyUsages, ...args) {
        this.checkKeyFormat(format);
        this.checkKeyData(format, keyData);
        this.checkAlgorithmName(algorithm);
        this.checkImportParams(algorithm);
        if (Array.isArray(this.usages)) {
          this.checkKeyUsages(keyUsages, this.usages);
        }
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages, ...args) {
        throw new UnsupportedOperationError("importKey");
      }
      checkAlgorithmName(algorithm) {
        if (algorithm.name.toLowerCase() !== this.name.toLowerCase()) {
          throw new AlgorithmError("Unrecognized name");
        }
      }
      checkAlgorithmParams(algorithm) {
      }
      checkDerivedKeyParams(algorithm) {
      }
      checkKeyUsages(usages, allowed) {
        for (const usage of usages) {
          if (allowed.indexOf(usage) === -1) {
            throw new TypeError("Cannot create a key using the specified key usages");
          }
        }
      }
      checkCryptoKey(key, keyUsage) {
        this.checkAlgorithmName(key.algorithm);
        if (keyUsage && key.usages.indexOf(keyUsage) === -1) {
          throw new CryptoError(`key does not match that of operation`);
        }
      }
      checkRequiredProperty(data, propName) {
        if (!(propName in data)) {
          throw new RequiredPropertyError(propName);
        }
      }
      checkHashAlgorithm(algorithm, hashAlgorithms) {
        for (const item of hashAlgorithms) {
          if (item.toLowerCase() === algorithm.name.toLowerCase()) {
            return;
          }
        }
        throw new OperationError(`hash: Must be one of ${hashAlgorithms.join(", ")}`);
      }
      checkImportParams(algorithm) {
      }
      checkKeyFormat(format) {
        switch (format) {
          case "raw":
          case "pkcs8":
          case "spki":
          case "jwk":
            break;
          default:
            throw new TypeError("format: Is invalid value. Must be 'jwk', 'raw', 'spki', or 'pkcs8'");
        }
      }
      checkKeyData(format, keyData) {
        if (!keyData) {
          throw new TypeError("keyData: Cannot be empty on empty on key importing");
        }
        if (format === "jwk") {
          if (!isJWK(keyData)) {
            throw new TypeError("keyData: Is not JsonWebToken");
          }
        } else if (!BufferSourceConverter.isBufferSource(keyData)) {
          throw new TypeError("keyData: Is not ArrayBufferView or ArrayBuffer");
        }
      }
      prepareData(data) {
        return BufferSourceConverter.toArrayBuffer(data);
      }
    };
    __name(ProviderCrypto, "ProviderCrypto");
    AesProvider = class extends ProviderCrypto {
      checkGenerateKeyParams(algorithm) {
        this.checkRequiredProperty(algorithm, "length");
        if (typeof algorithm.length !== "number") {
          throw new TypeError("length: Is not of type Number");
        }
        switch (algorithm.length) {
          case 128:
          case 192:
          case 256:
            break;
          default:
            throw new TypeError("length: Must be 128, 192, or 256");
        }
      }
      checkDerivedKeyParams(algorithm) {
        this.checkGenerateKeyParams(algorithm);
      }
    };
    __name(AesProvider, "AesProvider");
    AesCbcProvider = class extends AesProvider {
      constructor() {
        super(...arguments);
        this.name = "AES-CBC";
        this.usages = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "iv");
        if (!(algorithm.iv instanceof ArrayBuffer || ArrayBuffer.isView(algorithm.iv))) {
          throw new TypeError("iv: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
        if (algorithm.iv.byteLength !== 16) {
          throw new TypeError("iv: Must have length 16 bytes");
        }
      }
    };
    __name(AesCbcProvider, "AesCbcProvider");
    AesCmacProvider = class extends AesProvider {
      constructor() {
        super(...arguments);
        this.name = "AES-CMAC";
        this.usages = ["sign", "verify"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "length");
        if (typeof algorithm.length !== "number") {
          throw new TypeError("length: Is not a Number");
        }
        if (algorithm.length < 1) {
          throw new OperationError("length: Must be more than 0");
        }
      }
    };
    __name(AesCmacProvider, "AesCmacProvider");
    AesCtrProvider = class extends AesProvider {
      constructor() {
        super(...arguments);
        this.name = "AES-CTR";
        this.usages = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "counter");
        if (!(algorithm.counter instanceof ArrayBuffer || ArrayBuffer.isView(algorithm.counter))) {
          throw new TypeError("counter: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
        if (algorithm.counter.byteLength !== 16) {
          throw new TypeError("iv: Must have length 16 bytes");
        }
        this.checkRequiredProperty(algorithm, "length");
        if (typeof algorithm.length !== "number") {
          throw new TypeError("length: Is not a Number");
        }
        if (algorithm.length < 1) {
          throw new OperationError("length: Must be more than 0");
        }
      }
    };
    __name(AesCtrProvider, "AesCtrProvider");
    AesEcbProvider = class extends AesProvider {
      constructor() {
        super(...arguments);
        this.name = "AES-ECB";
        this.usages = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
      }
    };
    __name(AesEcbProvider, "AesEcbProvider");
    AesGcmProvider = class extends AesProvider {
      constructor() {
        super(...arguments);
        this.name = "AES-GCM";
        this.usages = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "iv");
        if (!(algorithm.iv instanceof ArrayBuffer || ArrayBuffer.isView(algorithm.iv))) {
          throw new TypeError("iv: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
        if (algorithm.iv.byteLength < 1) {
          throw new OperationError("iv: Must have length more than 0 and less than 2^64 - 1");
        }
        if (!("tagLength" in algorithm)) {
          algorithm.tagLength = 128;
        }
        switch (algorithm.tagLength) {
          case 32:
          case 64:
          case 96:
          case 104:
          case 112:
          case 120:
          case 128:
            break;
          default:
            throw new OperationError("tagLength: Must be one of 32, 64, 96, 104, 112, 120 or 128");
        }
      }
    };
    __name(AesGcmProvider, "AesGcmProvider");
    AesKwProvider = class extends AesProvider {
      constructor() {
        super(...arguments);
        this.name = "AES-KW";
        this.usages = ["wrapKey", "unwrapKey"];
      }
    };
    __name(AesKwProvider, "AesKwProvider");
    DesProvider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.usages = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
      }
      checkAlgorithmParams(algorithm) {
        if (this.ivSize) {
          this.checkRequiredProperty(algorithm, "iv");
          if (!(algorithm.iv instanceof ArrayBuffer || ArrayBuffer.isView(algorithm.iv))) {
            throw new TypeError("iv: Is not of type '(ArrayBuffer or ArrayBufferView)'");
          }
          if (algorithm.iv.byteLength !== this.ivSize) {
            throw new TypeError(`iv: Must have length ${this.ivSize} bytes`);
          }
        }
      }
      checkGenerateKeyParams(algorithm) {
        this.checkRequiredProperty(algorithm, "length");
        if (typeof algorithm.length !== "number") {
          throw new TypeError("length: Is not of type Number");
        }
        if (algorithm.length !== this.keySizeBits) {
          throw new OperationError(`algorithm.length: Must be ${this.keySizeBits}`);
        }
      }
      checkDerivedKeyParams(algorithm) {
        this.checkGenerateKeyParams(algorithm);
      }
    };
    __name(DesProvider, "DesProvider");
    RsaProvider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.hashAlgorithms = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
      }
      checkGenerateKeyParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
        this.checkRequiredProperty(algorithm, "publicExponent");
        if (!(algorithm.publicExponent && algorithm.publicExponent instanceof Uint8Array)) {
          throw new TypeError("publicExponent: Missing or not a Uint8Array");
        }
        const publicExponent = Convert.ToBase64(algorithm.publicExponent);
        if (!(publicExponent === "Aw==" || publicExponent === "AQAB")) {
          throw new TypeError("publicExponent: Must be [3] or [1,0,1]");
        }
        this.checkRequiredProperty(algorithm, "modulusLength");
        if (algorithm.modulusLength % 8 || algorithm.modulusLength < 256 || algorithm.modulusLength > 16384) {
          throw new TypeError("The modulus length must be a multiple of 8 bits and >= 256 and <= 16384");
        }
      }
      checkImportParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
      }
    };
    __name(RsaProvider, "RsaProvider");
    RsaSsaProvider = class extends RsaProvider {
      constructor() {
        super(...arguments);
        this.name = "RSASSA-PKCS1-v1_5";
        this.usages = {
          privateKey: ["sign"],
          publicKey: ["verify"]
        };
      }
    };
    __name(RsaSsaProvider, "RsaSsaProvider");
    RsaPssProvider = class extends RsaProvider {
      constructor() {
        super(...arguments);
        this.name = "RSA-PSS";
        this.usages = {
          privateKey: ["sign"],
          publicKey: ["verify"]
        };
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "saltLength");
        if (typeof algorithm.saltLength !== "number") {
          throw new TypeError("saltLength: Is not a Number");
        }
        if (algorithm.saltLength < 0) {
          throw new RangeError("saltLength: Must be positive number");
        }
      }
    };
    __name(RsaPssProvider, "RsaPssProvider");
    RsaOaepProvider = class extends RsaProvider {
      constructor() {
        super(...arguments);
        this.name = "RSA-OAEP";
        this.usages = {
          privateKey: ["decrypt", "unwrapKey"],
          publicKey: ["encrypt", "wrapKey"]
        };
      }
      checkAlgorithmParams(algorithm) {
        if (algorithm.label && !(algorithm.label instanceof ArrayBuffer || ArrayBuffer.isView(algorithm.label))) {
          throw new TypeError("label: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
      }
    };
    __name(RsaOaepProvider, "RsaOaepProvider");
    EllipticProvider = class extends ProviderCrypto {
      checkGenerateKeyParams(algorithm) {
        this.checkRequiredProperty(algorithm, "namedCurve");
        this.checkNamedCurve(algorithm.namedCurve);
      }
      checkNamedCurve(namedCurve) {
        for (const item of this.namedCurves) {
          if (item.toLowerCase() === namedCurve.toLowerCase()) {
            return;
          }
        }
        throw new OperationError(`namedCurve: Must be one of ${this.namedCurves.join(", ")}`);
      }
    };
    __name(EllipticProvider, "EllipticProvider");
    EcdsaProvider = class extends EllipticProvider {
      constructor() {
        super(...arguments);
        this.name = "ECDSA";
        this.hashAlgorithms = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        this.usages = {
          privateKey: ["sign"],
          publicKey: ["verify"]
        };
        this.namedCurves = ["P-256", "P-384", "P-521", "K-256"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
      }
    };
    __name(EcdsaProvider, "EcdsaProvider");
    KEY_TYPES = ["secret", "private", "public"];
    CryptoKey = class {
      static create(algorithm, type, extractable, usages) {
        const key = new this();
        key.algorithm = algorithm;
        key.type = type;
        key.extractable = extractable;
        key.usages = usages;
        return key;
      }
      static isKeyType(data) {
        return KEY_TYPES.indexOf(data) !== -1;
      }
      get [Symbol.toStringTag]() {
        return "CryptoKey";
      }
    };
    __name(CryptoKey, "CryptoKey");
    EcdhProvider = class extends EllipticProvider {
      constructor() {
        super(...arguments);
        this.name = "ECDH";
        this.usages = {
          privateKey: ["deriveBits", "deriveKey"],
          publicKey: []
        };
        this.namedCurves = ["P-256", "P-384", "P-521", "K-256"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "public");
        if (!(algorithm.public instanceof CryptoKey)) {
          throw new TypeError("public: Is not a CryptoKey");
        }
        if (algorithm.public.type !== "public") {
          throw new OperationError("public: Is not a public key");
        }
        if (algorithm.public.algorithm.name !== this.name) {
          throw new OperationError(`public: Is not ${this.name} key`);
        }
      }
    };
    __name(EcdhProvider, "EcdhProvider");
    EcdhEsProvider = class extends EcdhProvider {
      constructor() {
        super(...arguments);
        this.name = "ECDH-ES";
        this.namedCurves = ["X25519", "X448"];
      }
    };
    __name(EcdhEsProvider, "EcdhEsProvider");
    EdDsaProvider = class extends EllipticProvider {
      constructor() {
        super(...arguments);
        this.name = "EdDSA";
        this.usages = {
          privateKey: ["sign"],
          publicKey: ["verify"]
        };
        this.namedCurves = ["Ed25519", "Ed448"];
      }
    };
    __name(EdDsaProvider, "EdDsaProvider");
    ObjectIdentifier2 = /* @__PURE__ */ __name(class ObjectIdentifier3 {
      constructor(value) {
        if (value) {
          this.value = value;
        }
      }
    }, "ObjectIdentifier");
    __decorate([
      AsnProp({ type: AsnPropTypes.ObjectIdentifier })
    ], ObjectIdentifier2.prototype, "value", void 0);
    ObjectIdentifier2 = __decorate([
      AsnType({ type: AsnTypeTypes.Choice })
    ], ObjectIdentifier2);
    AlgorithmIdentifier = class {
      constructor(params) {
        Object.assign(this, params);
      }
    };
    __name(AlgorithmIdentifier, "AlgorithmIdentifier");
    __decorate([
      AsnProp({
        type: AsnPropTypes.ObjectIdentifier
      })
    ], AlgorithmIdentifier.prototype, "algorithm", void 0);
    __decorate([
      AsnProp({
        type: AsnPropTypes.Any,
        optional: true
      })
    ], AlgorithmIdentifier.prototype, "parameters", void 0);
    PrivateKeyInfo = class {
      constructor() {
        this.version = 0;
        this.privateKeyAlgorithm = new AlgorithmIdentifier();
        this.privateKey = new ArrayBuffer(0);
      }
    };
    __name(PrivateKeyInfo, "PrivateKeyInfo");
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer })
    ], PrivateKeyInfo.prototype, "version", void 0);
    __decorate([
      AsnProp({ type: AlgorithmIdentifier })
    ], PrivateKeyInfo.prototype, "privateKeyAlgorithm", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.OctetString })
    ], PrivateKeyInfo.prototype, "privateKey", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Any, optional: true })
    ], PrivateKeyInfo.prototype, "attributes", void 0);
    PublicKeyInfo = class {
      constructor() {
        this.publicKeyAlgorithm = new AlgorithmIdentifier();
        this.publicKey = new ArrayBuffer(0);
      }
    };
    __name(PublicKeyInfo, "PublicKeyInfo");
    __decorate([
      AsnProp({ type: AlgorithmIdentifier })
    ], PublicKeyInfo.prototype, "publicKeyAlgorithm", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.BitString })
    ], PublicKeyInfo.prototype, "publicKey", void 0);
    JsonBase64UrlArrayBufferConverter = {
      fromJSON: (value) => Convert.FromBase64Url(value),
      toJSON: (value) => Convert.ToBase64Url(new Uint8Array(value))
    };
    AsnIntegerArrayBufferConverter = {
      fromASN: (value) => {
        const valueHex = value.valueBlock.valueHex;
        return !new Uint8Array(valueHex)[0] ? value.valueBlock.valueHex.slice(1) : value.valueBlock.valueHex;
      },
      toASN: (value) => {
        const valueHex = new Uint8Array(value)[0] > 127 ? combine(new Uint8Array([0]).buffer, value) : value;
        return new Integer({ valueHex });
      }
    };
    RsaPrivateKey = class {
      constructor() {
        this.version = 0;
        this.modulus = new ArrayBuffer(0);
        this.publicExponent = new ArrayBuffer(0);
        this.privateExponent = new ArrayBuffer(0);
        this.prime1 = new ArrayBuffer(0);
        this.prime2 = new ArrayBuffer(0);
        this.exponent1 = new ArrayBuffer(0);
        this.exponent2 = new ArrayBuffer(0);
        this.coefficient = new ArrayBuffer(0);
      }
    };
    __name(RsaPrivateKey, "RsaPrivateKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
    ], RsaPrivateKey.prototype, "version", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "n", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "modulus", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "e", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "publicExponent", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "d", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "privateExponent", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "p", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "prime1", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "q", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "prime2", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "dp", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "exponent1", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "dq", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "exponent2", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "qi", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPrivateKey.prototype, "coefficient", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Any, optional: true })
    ], RsaPrivateKey.prototype, "otherPrimeInfos", void 0);
    RsaPublicKey = class {
      constructor() {
        this.modulus = new ArrayBuffer(0);
        this.publicExponent = new ArrayBuffer(0);
      }
    };
    __name(RsaPublicKey, "RsaPublicKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "n", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPublicKey.prototype, "modulus", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerArrayBufferConverter }),
      JsonProp({ name: "e", converter: JsonBase64UrlArrayBufferConverter })
    ], RsaPublicKey.prototype, "publicExponent", void 0);
    EcPublicKey = /* @__PURE__ */ __name(class EcPublicKey2 {
      constructor(value) {
        this.value = new ArrayBuffer(0);
        if (value) {
          this.value = value;
        }
      }
      toJSON() {
        let bytes = new Uint8Array(this.value);
        if (bytes[0] !== 4) {
          throw new CryptoError("Wrong ECPoint. Current version supports only Uncompressed (0x04) point");
        }
        bytes = new Uint8Array(this.value.slice(1));
        const size = bytes.length / 2;
        const offset = 0;
        const json = {
          x: Convert.ToBase64Url(bytes.buffer.slice(offset, offset + size)),
          y: Convert.ToBase64Url(bytes.buffer.slice(offset + size, offset + size + size))
        };
        return json;
      }
      fromJSON(json) {
        if (!("x" in json)) {
          throw new Error("x: Missing required property");
        }
        if (!("y" in json)) {
          throw new Error("y: Missing required property");
        }
        const x = Convert.FromBase64Url(json.x);
        const y = Convert.FromBase64Url(json.y);
        const value = combine(new Uint8Array([4]).buffer, x, y);
        this.value = new Uint8Array(value).buffer;
        return this;
      }
    }, "EcPublicKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.OctetString })
    ], EcPublicKey.prototype, "value", void 0);
    EcPublicKey = __decorate([
      AsnType({ type: AsnTypeTypes.Choice })
    ], EcPublicKey);
    EcPrivateKey = class {
      constructor() {
        this.version = 1;
        this.privateKey = new ArrayBuffer(0);
      }
      fromJSON(json) {
        if (!("d" in json)) {
          throw new Error("d: Missing required property");
        }
        this.privateKey = Convert.FromBase64Url(json.d);
        if ("x" in json) {
          const publicKey = new EcPublicKey();
          publicKey.fromJSON(json);
          this.publicKey = AsnSerializer.toASN(publicKey).valueBlock.valueHex;
        }
        return this;
      }
      toJSON() {
        const jwk = {};
        jwk.d = Convert.ToBase64Url(this.privateKey);
        if (this.publicKey) {
          Object.assign(jwk, new EcPublicKey(this.publicKey).toJSON());
        }
        return jwk;
      }
    };
    __name(EcPrivateKey, "EcPrivateKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerConverter })
    ], EcPrivateKey.prototype, "version", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.OctetString })
    ], EcPrivateKey.prototype, "privateKey", void 0);
    __decorate([
      AsnProp({ context: 0, type: AsnPropTypes.Any, optional: true })
    ], EcPrivateKey.prototype, "parameters", void 0);
    __decorate([
      AsnProp({ context: 1, type: AsnPropTypes.BitString, optional: true })
    ], EcPrivateKey.prototype, "publicKey", void 0);
    AsnIntegerWithoutPaddingConverter = {
      fromASN: (value) => {
        const bytes = new Uint8Array(value.valueBlock.valueHex);
        return bytes[0] === 0 ? bytes.buffer.slice(1) : bytes.buffer;
      },
      toASN: (value) => {
        const bytes = new Uint8Array(value);
        if (bytes[0] > 127) {
          const newValue = new Uint8Array(bytes.length + 1);
          newValue.set(bytes, 1);
          return new Integer({ valueHex: newValue.buffer });
        }
        return new Integer({ valueHex: value });
      }
    };
    index$2 = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      AsnIntegerWithoutPaddingConverter
    });
    EcUtils = class {
      static decodePoint(data, pointSize) {
        const view = BufferSourceConverter.toUint8Array(data);
        if (view.length === 0 || view[0] !== 4) {
          throw new Error("Only uncompressed point format supported");
        }
        const n = (view.length - 1) / 2;
        if (n !== Math.ceil(pointSize / 8)) {
          throw new Error("Point does not match field size");
        }
        const xb = view.slice(1, n + 1);
        const yb = view.slice(n + 1, n + 1 + n);
        return { x: xb, y: yb };
      }
      static encodePoint(point, pointSize) {
        const size = Math.ceil(pointSize / 8);
        if (point.x.byteLength !== size || point.y.byteLength !== size) {
          throw new Error("X,Y coordinates don't match point size criteria");
        }
        const x = BufferSourceConverter.toUint8Array(point.x);
        const y = BufferSourceConverter.toUint8Array(point.y);
        const res = new Uint8Array(size * 2 + 1);
        res[0] = 4;
        res.set(x, 1);
        res.set(y, size + 1);
        return res;
      }
      static getSize(pointSize) {
        return Math.ceil(pointSize / 8);
      }
      static encodeSignature(signature, pointSize) {
        const size = this.getSize(pointSize);
        const r = BufferSourceConverter.toUint8Array(signature.r);
        const s = BufferSourceConverter.toUint8Array(signature.s);
        const res = new Uint8Array(size * 2);
        res.set(this.padStart(r, size));
        res.set(this.padStart(s, size), size);
        return res;
      }
      static decodeSignature(data, pointSize) {
        const size = this.getSize(pointSize);
        const view = BufferSourceConverter.toUint8Array(data);
        if (view.length !== size * 2) {
          throw new Error("Incorrect size of the signature");
        }
        const r = view.slice(0, size);
        const s = view.slice(size);
        return {
          r: this.trimStart(r),
          s: this.trimStart(s)
        };
      }
      static trimStart(data) {
        let i = 0;
        while (i < data.length - 1 && data[i] === 0) {
          i++;
        }
        if (i === 0) {
          return data;
        }
        return data.slice(i, data.length);
      }
      static padStart(data, size) {
        if (size === data.length) {
          return data;
        }
        const res = new Uint8Array(size);
        res.set(data, size - data.length);
        return res;
      }
    };
    __name(EcUtils, "EcUtils");
    EcDsaSignature = class {
      constructor() {
        this.r = new ArrayBuffer(0);
        this.s = new ArrayBuffer(0);
      }
      static fromWebCryptoSignature(value) {
        const pointSize = value.byteLength / 2;
        const point = EcUtils.decodeSignature(value, pointSize * 8);
        const ecSignature = new EcDsaSignature();
        ecSignature.r = BufferSourceConverter.toArrayBuffer(point.r);
        ecSignature.s = BufferSourceConverter.toArrayBuffer(point.s);
        return ecSignature;
      }
      toWebCryptoSignature(pointSize) {
        pointSize !== null && pointSize !== void 0 ? pointSize : pointSize = Math.max(this.r.byteLength, this.s.byteLength) * 8;
        const signature = EcUtils.encodeSignature(this, pointSize);
        return signature.buffer;
      }
    };
    __name(EcDsaSignature, "EcDsaSignature");
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerWithoutPaddingConverter })
    ], EcDsaSignature.prototype, "r", void 0);
    __decorate([
      AsnProp({ type: AsnPropTypes.Integer, converter: AsnIntegerWithoutPaddingConverter })
    ], EcDsaSignature.prototype, "s", void 0);
    OneAsymmetricKey = class extends PrivateKeyInfo {
    };
    __name(OneAsymmetricKey, "OneAsymmetricKey");
    __decorate([
      AsnProp({ context: 1, implicit: true, type: AsnPropTypes.BitString, optional: true })
    ], OneAsymmetricKey.prototype, "publicKey", void 0);
    EdPrivateKey = /* @__PURE__ */ __name(class EdPrivateKey2 {
      constructor() {
        this.value = new ArrayBuffer(0);
      }
      fromJSON(json) {
        if (!json.d) {
          throw new Error("d: Missing required property");
        }
        this.value = Convert.FromBase64Url(json.d);
        return this;
      }
      toJSON() {
        const jwk = {
          d: Convert.ToBase64Url(this.value)
        };
        return jwk;
      }
    }, "EdPrivateKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.OctetString })
    ], EdPrivateKey.prototype, "value", void 0);
    EdPrivateKey = __decorate([
      AsnType({ type: AsnTypeTypes.Choice })
    ], EdPrivateKey);
    EdPublicKey = /* @__PURE__ */ __name(class EdPublicKey2 {
      constructor(value) {
        this.value = new ArrayBuffer(0);
        if (value) {
          this.value = value;
        }
      }
      toJSON() {
        const json = {
          x: Convert.ToBase64Url(this.value)
        };
        return json;
      }
      fromJSON(json) {
        if (!("x" in json)) {
          throw new Error("x: Missing required property");
        }
        this.value = Convert.FromBase64Url(json.x);
        return this;
      }
    }, "EdPublicKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.BitString })
    ], EdPublicKey.prototype, "value", void 0);
    EdPublicKey = __decorate([
      AsnType({ type: AsnTypeTypes.Choice })
    ], EdPublicKey);
    CurvePrivateKey = /* @__PURE__ */ __name(class CurvePrivateKey2 {
    }, "CurvePrivateKey");
    __decorate([
      AsnProp({ type: AsnPropTypes.OctetString }),
      JsonProp({ type: JsonPropTypes.String, converter: JsonBase64UrlArrayBufferConverter })
    ], CurvePrivateKey.prototype, "d", void 0);
    CurvePrivateKey = __decorate([
      AsnType({ type: AsnTypeTypes.Choice })
    ], CurvePrivateKey);
    idSecp256r1 = "1.2.840.10045.3.1.7";
    idEllipticCurve = "1.3.132.0";
    idSecp384r1 = `${idEllipticCurve}.34`;
    idSecp521r1 = `${idEllipticCurve}.35`;
    idSecp256k1 = `${idEllipticCurve}.10`;
    idVersionOne = "1.3.36.3.3.2.8.1.1";
    idBrainpoolP160r1 = `${idVersionOne}.1`;
    idBrainpoolP160t1 = `${idVersionOne}.2`;
    idBrainpoolP192r1 = `${idVersionOne}.3`;
    idBrainpoolP192t1 = `${idVersionOne}.4`;
    idBrainpoolP224r1 = `${idVersionOne}.5`;
    idBrainpoolP224t1 = `${idVersionOne}.6`;
    idBrainpoolP256r1 = `${idVersionOne}.7`;
    idBrainpoolP256t1 = `${idVersionOne}.8`;
    idBrainpoolP320r1 = `${idVersionOne}.9`;
    idBrainpoolP320t1 = `${idVersionOne}.10`;
    idBrainpoolP384r1 = `${idVersionOne}.11`;
    idBrainpoolP384t1 = `${idVersionOne}.12`;
    idBrainpoolP512r1 = `${idVersionOne}.13`;
    idBrainpoolP512t1 = `${idVersionOne}.14`;
    idX25519 = "1.3.101.110";
    idX448 = "1.3.101.111";
    idEd25519 = "1.3.101.112";
    idEd448 = "1.3.101.113";
    index$1 = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      converters: index$2,
      get ObjectIdentifier() {
        return ObjectIdentifier2;
      },
      AlgorithmIdentifier,
      PrivateKeyInfo,
      PublicKeyInfo,
      RsaPrivateKey,
      RsaPublicKey,
      EcPrivateKey,
      get EcPublicKey() {
        return EcPublicKey;
      },
      EcDsaSignature,
      OneAsymmetricKey,
      get EdPrivateKey() {
        return EdPrivateKey;
      },
      get EdPublicKey() {
        return EdPublicKey;
      },
      get CurvePrivateKey() {
        return CurvePrivateKey;
      },
      idSecp256r1,
      idEllipticCurve,
      idSecp384r1,
      idSecp521r1,
      idSecp256k1,
      idVersionOne,
      idBrainpoolP160r1,
      idBrainpoolP160t1,
      idBrainpoolP192r1,
      idBrainpoolP192t1,
      idBrainpoolP224r1,
      idBrainpoolP224t1,
      idBrainpoolP256r1,
      idBrainpoolP256t1,
      idBrainpoolP320r1,
      idBrainpoolP320t1,
      idBrainpoolP384r1,
      idBrainpoolP384t1,
      idBrainpoolP512r1,
      idBrainpoolP512t1,
      idX25519,
      idX448,
      idEd25519,
      idEd448
    });
    EcCurves = class {
      constructor() {
      }
      static register(item) {
        const oid = new ObjectIdentifier2();
        oid.value = item.id;
        const raw = AsnConvert.serialize(oid);
        this.items.push({
          ...item,
          raw
        });
        this.names.push(item.name);
      }
      static find(nameOrId) {
        nameOrId = nameOrId.toUpperCase();
        for (const item of this.items) {
          if (item.name.toUpperCase() === nameOrId || item.id.toUpperCase() === nameOrId) {
            return item;
          }
        }
        return null;
      }
      static get(nameOrId) {
        const res = this.find(nameOrId);
        if (!res) {
          throw new Error(`Unsupported EC named curve '${nameOrId}'`);
        }
        return res;
      }
    };
    __name(EcCurves, "EcCurves");
    EcCurves.items = [];
    EcCurves.names = [];
    EcCurves.register({ name: "P-256", id: idSecp256r1, size: 256 });
    EcCurves.register({ name: "P-384", id: idSecp384r1, size: 384 });
    EcCurves.register({ name: "P-521", id: idSecp521r1, size: 521 });
    EcCurves.register({ name: "K-256", id: idSecp256k1, size: 256 });
    EcCurves.register({ name: "brainpoolP160r1", id: idBrainpoolP160r1, size: 160 });
    EcCurves.register({ name: "brainpoolP160t1", id: idBrainpoolP160t1, size: 160 });
    EcCurves.register({ name: "brainpoolP192r1", id: idBrainpoolP192r1, size: 192 });
    EcCurves.register({ name: "brainpoolP192t1", id: idBrainpoolP192t1, size: 192 });
    EcCurves.register({ name: "brainpoolP224r1", id: idBrainpoolP224r1, size: 224 });
    EcCurves.register({ name: "brainpoolP224t1", id: idBrainpoolP224t1, size: 224 });
    EcCurves.register({ name: "brainpoolP256r1", id: idBrainpoolP256r1, size: 256 });
    EcCurves.register({ name: "brainpoolP256t1", id: idBrainpoolP256t1, size: 256 });
    EcCurves.register({ name: "brainpoolP320r1", id: idBrainpoolP320r1, size: 320 });
    EcCurves.register({ name: "brainpoolP320t1", id: idBrainpoolP320t1, size: 320 });
    EcCurves.register({ name: "brainpoolP384r1", id: idBrainpoolP384r1, size: 384 });
    EcCurves.register({ name: "brainpoolP384t1", id: idBrainpoolP384t1, size: 384 });
    EcCurves.register({ name: "brainpoolP512r1", id: idBrainpoolP512r1, size: 512 });
    EcCurves.register({ name: "brainpoolP512t1", id: idBrainpoolP512t1, size: 512 });
    HmacProvider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "HMAC";
        this.hashAlgorithms = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        this.usages = ["sign", "verify"];
      }
      getDefaultLength(algName) {
        switch (algName.toUpperCase()) {
          case "SHA-1":
          case "SHA-256":
          case "SHA-384":
          case "SHA-512":
            return 512;
          default:
            throw new Error(`Unknown algorithm name '${algName}'`);
        }
      }
      checkGenerateKeyParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
        if ("length" in algorithm) {
          if (typeof algorithm.length !== "number") {
            throw new TypeError("length: Is not a Number");
          }
          if (algorithm.length < 1) {
            throw new RangeError("length: Number is out of range");
          }
        }
      }
      checkImportParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
      }
    };
    __name(HmacProvider, "HmacProvider");
    Pbkdf2Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "PBKDF2";
        this.hashAlgorithms = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        this.usages = ["deriveBits", "deriveKey"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
        this.checkRequiredProperty(algorithm, "salt");
        if (!(algorithm.salt instanceof ArrayBuffer || ArrayBuffer.isView(algorithm.salt))) {
          throw new TypeError("salt: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
        this.checkRequiredProperty(algorithm, "iterations");
        if (typeof algorithm.iterations !== "number") {
          throw new TypeError("iterations: Is not a Number");
        }
        if (algorithm.iterations < 1) {
          throw new TypeError("iterations: Is less than 1");
        }
      }
      checkImportKey(format, keyData, algorithm, extractable, keyUsages, ...args) {
        super.checkImportKey(format, keyData, algorithm, extractable, keyUsages);
        if (extractable) {
          throw new SyntaxError("extractable: Must be 'false'");
        }
      }
    };
    __name(Pbkdf2Provider, "Pbkdf2Provider");
    HkdfProvider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "HKDF";
        this.hashAlgorithms = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        this.usages = ["deriveKey", "deriveBits"];
      }
      checkAlgorithmParams(algorithm) {
        this.checkRequiredProperty(algorithm, "hash");
        this.checkHashAlgorithm(algorithm.hash, this.hashAlgorithms);
        this.checkRequiredProperty(algorithm, "salt");
        if (!BufferSourceConverter.isBufferSource(algorithm.salt)) {
          throw new TypeError("salt: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
        this.checkRequiredProperty(algorithm, "info");
        if (!BufferSourceConverter.isBufferSource(algorithm.info)) {
          throw new TypeError("salt: Is not of type '(ArrayBuffer or ArrayBufferView)'");
        }
      }
      checkImportKey(format, keyData, algorithm, extractable, keyUsages, ...args) {
        super.checkImportKey(format, keyData, algorithm, extractable, keyUsages);
        if (extractable) {
          throw new SyntaxError("extractable: Must be 'false'");
        }
      }
    };
    __name(HkdfProvider, "HkdfProvider");
    ShakeProvider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.usages = [];
        this.defaultLength = 0;
      }
      digest(...args) {
        args[0] = { length: this.defaultLength, ...args[0] };
        return super.digest.apply(this, args);
      }
      checkDigest(algorithm, data) {
        super.checkDigest(algorithm, data);
        const length = algorithm.length || 0;
        if (typeof length !== "number") {
          throw new TypeError("length: Is not a Number");
        }
        if (length < 0) {
          throw new TypeError("length: Is negative");
        }
      }
    };
    __name(ShakeProvider, "ShakeProvider");
    Shake128Provider = class extends ShakeProvider {
      constructor() {
        super(...arguments);
        this.name = "shake128";
        this.defaultLength = 16;
      }
    };
    __name(Shake128Provider, "Shake128Provider");
    Shake256Provider = class extends ShakeProvider {
      constructor() {
        super(...arguments);
        this.name = "shake256";
        this.defaultLength = 32;
      }
    };
    __name(Shake256Provider, "Shake256Provider");
    Crypto = class {
      get [Symbol.toStringTag]() {
        return "Crypto";
      }
      randomUUID() {
        const b = this.getRandomValues(new Uint8Array(16));
        b[6] = b[6] & 15 | 64;
        b[8] = b[8] & 63 | 128;
        const uuid = Convert.ToHex(b).toLowerCase();
        return `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16)}`;
      }
    };
    __name(Crypto, "Crypto");
    ProviderStorage = class {
      constructor() {
        this.items = {};
      }
      get(algorithmName) {
        return this.items[algorithmName.toLowerCase()] || null;
      }
      set(provider) {
        this.items[provider.name.toLowerCase()] = provider;
      }
      removeAt(algorithmName) {
        const provider = this.get(algorithmName.toLowerCase());
        if (provider) {
          delete this.items[algorithmName];
        }
        return provider;
      }
      has(name) {
        return !!this.get(name);
      }
      get length() {
        return Object.keys(this.items).length;
      }
      get algorithms() {
        const algorithms = [];
        for (const key in this.items) {
          const provider = this.items[key];
          algorithms.push(provider.name);
        }
        return algorithms.sort();
      }
    };
    __name(ProviderStorage, "ProviderStorage");
    SubtleCrypto = class {
      constructor() {
        this.providers = new ProviderStorage();
      }
      static isHashedAlgorithm(data) {
        return data && typeof data === "object" && "name" in data && "hash" in data ? true : false;
      }
      get [Symbol.toStringTag]() {
        return "SubtleCrypto";
      }
      async digest(...args) {
        this.checkRequiredArguments(args, 2, "digest");
        const [algorithm, data, ...params] = args;
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(data);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.digest(preparedAlgorithm, preparedData, ...params);
        return result;
      }
      async generateKey(...args) {
        this.checkRequiredArguments(args, 3, "generateKey");
        const [algorithm, extractable, keyUsages, ...params] = args;
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.generateKey({ ...preparedAlgorithm, name: provider.name }, extractable, keyUsages, ...params);
        return result;
      }
      async sign(...args) {
        this.checkRequiredArguments(args, 3, "sign");
        const [algorithm, key, data, ...params] = args;
        this.checkCryptoKey(key);
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(data);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.sign({ ...preparedAlgorithm, name: provider.name }, key, preparedData, ...params);
        return result;
      }
      async verify(...args) {
        this.checkRequiredArguments(args, 4, "verify");
        const [algorithm, key, signature, data, ...params] = args;
        this.checkCryptoKey(key);
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(data);
        const preparedSignature = BufferSourceConverter.toArrayBuffer(signature);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.verify({ ...preparedAlgorithm, name: provider.name }, key, preparedSignature, preparedData, ...params);
        return result;
      }
      async encrypt(...args) {
        this.checkRequiredArguments(args, 3, "encrypt");
        const [algorithm, key, data, ...params] = args;
        this.checkCryptoKey(key);
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(data);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.encrypt({ ...preparedAlgorithm, name: provider.name }, key, preparedData, { keyUsage: true }, ...params);
        return result;
      }
      async decrypt(...args) {
        this.checkRequiredArguments(args, 3, "decrypt");
        const [algorithm, key, data, ...params] = args;
        this.checkCryptoKey(key);
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(data);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.decrypt({ ...preparedAlgorithm, name: provider.name }, key, preparedData, { keyUsage: true }, ...params);
        return result;
      }
      async deriveBits(...args) {
        this.checkRequiredArguments(args, 3, "deriveBits");
        const [algorithm, baseKey, length, ...params] = args;
        this.checkCryptoKey(baseKey);
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const provider = this.getProvider(preparedAlgorithm.name);
        const result = await provider.deriveBits({ ...preparedAlgorithm, name: provider.name }, baseKey, length, { keyUsage: true }, ...params);
        return result;
      }
      async deriveKey(...args) {
        this.checkRequiredArguments(args, 5, "deriveKey");
        const [algorithm, baseKey, derivedKeyType, extractable, keyUsages, ...params] = args;
        const preparedDerivedKeyType = this.prepareAlgorithm(derivedKeyType);
        const importProvider = this.getProvider(preparedDerivedKeyType.name);
        importProvider.checkDerivedKeyParams(preparedDerivedKeyType);
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const provider = this.getProvider(preparedAlgorithm.name);
        provider.checkCryptoKey(baseKey, "deriveKey");
        const derivedBits = await provider.deriveBits({ ...preparedAlgorithm, name: provider.name }, baseKey, derivedKeyType.length || 512, { keyUsage: false }, ...params);
        return this.importKey("raw", derivedBits, derivedKeyType, extractable, keyUsages, ...params);
      }
      async exportKey(...args) {
        this.checkRequiredArguments(args, 2, "exportKey");
        const [format, key, ...params] = args;
        this.checkCryptoKey(key);
        const provider = this.getProvider(key.algorithm.name);
        const result = await provider.exportKey(format, key, ...params);
        return result;
      }
      async importKey(...args) {
        this.checkRequiredArguments(args, 5, "importKey");
        const [format, keyData, algorithm, extractable, keyUsages, ...params] = args;
        const preparedAlgorithm = this.prepareAlgorithm(algorithm);
        const provider = this.getProvider(preparedAlgorithm.name);
        if (["pkcs8", "spki", "raw"].indexOf(format) !== -1) {
          const preparedData = BufferSourceConverter.toArrayBuffer(keyData);
          return provider.importKey(format, preparedData, { ...preparedAlgorithm, name: provider.name }, extractable, keyUsages, ...params);
        } else {
          if (!keyData.kty) {
            throw new TypeError("keyData: Is not JSON");
          }
        }
        return provider.importKey(format, keyData, { ...preparedAlgorithm, name: provider.name }, extractable, keyUsages, ...params);
      }
      async wrapKey(format, key, wrappingKey, wrapAlgorithm, ...args) {
        let keyData = await this.exportKey(format, key, ...args);
        if (format === "jwk") {
          const json = JSON.stringify(keyData);
          keyData = Convert.FromUtf8String(json);
        }
        const preparedAlgorithm = this.prepareAlgorithm(wrapAlgorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(keyData);
        const provider = this.getProvider(preparedAlgorithm.name);
        return provider.encrypt({ ...preparedAlgorithm, name: provider.name }, wrappingKey, preparedData, { keyUsage: false }, ...args);
      }
      async unwrapKey(format, wrappedKey, unwrappingKey, unwrapAlgorithm, unwrappedKeyAlgorithm, extractable, keyUsages, ...args) {
        const preparedAlgorithm = this.prepareAlgorithm(unwrapAlgorithm);
        const preparedData = BufferSourceConverter.toArrayBuffer(wrappedKey);
        const provider = this.getProvider(preparedAlgorithm.name);
        let keyData = await provider.decrypt({ ...preparedAlgorithm, name: provider.name }, unwrappingKey, preparedData, { keyUsage: false }, ...args);
        if (format === "jwk") {
          try {
            keyData = JSON.parse(Convert.ToUtf8String(keyData));
          } catch (e) {
            const error = new TypeError("wrappedKey: Is not a JSON");
            error.internal = e;
            throw error;
          }
        }
        return this.importKey(format, keyData, unwrappedKeyAlgorithm, extractable, keyUsages, ...args);
      }
      checkRequiredArguments(args, size, methodName) {
        if (args.length < size) {
          throw new TypeError(`Failed to execute '${methodName}' on 'SubtleCrypto': ${size} arguments required, but only ${args.length} present`);
        }
      }
      prepareAlgorithm(algorithm) {
        if (typeof algorithm === "string") {
          return {
            name: algorithm
          };
        }
        if (SubtleCrypto.isHashedAlgorithm(algorithm)) {
          const preparedAlgorithm = { ...algorithm };
          preparedAlgorithm.hash = this.prepareAlgorithm(algorithm.hash);
          return preparedAlgorithm;
        }
        return { ...algorithm };
      }
      getProvider(name) {
        const provider = this.providers.get(name);
        if (!provider) {
          throw new AlgorithmError("Unrecognized name");
        }
        return provider;
      }
      checkCryptoKey(key) {
        if (!(key instanceof CryptoKey)) {
          throw new TypeError(`Key is not of type 'CryptoKey'`);
        }
      }
    };
    __name(SubtleCrypto, "SubtleCrypto");
  }
});

// ../../node_modules/.pnpm/@peculiar+webcrypto@1.4.0/node_modules/@peculiar/webcrypto/build/webcrypto.es.js
var webcrypto_es_exports = {};
__export(webcrypto_es_exports, {
  Crypto: () => Crypto2,
  CryptoKey: () => CryptoKey
});
function getCryptoKey(key) {
  const res = keyStorage.get(key);
  if (!res) {
    throw new OperationError("Cannot get CryptoKey from secure storage");
  }
  return res;
}
function setCryptoKey(value) {
  const key = CryptoKey.create(value.algorithm, value.type, value.extractable, value.usages);
  Object.freeze(key);
  keyStorage.set(key, value);
  return key;
}
function bitShiftLeft(buffer) {
  const shifted = Buffer.alloc(buffer.length);
  const last = buffer.length - 1;
  for (let index = 0; index < last; index++) {
    shifted[index] = buffer[index] << 1;
    if (buffer[index + 1] & 128) {
      shifted[index] += 1;
    }
  }
  shifted[last] = buffer[last] << 1;
  return shifted;
}
function xor(a, b) {
  const length = Math.min(a.length, b.length);
  const output = Buffer.alloc(length);
  for (let index = 0; index < length; index++) {
    output[index] = a[index] ^ b[index];
  }
  return output;
}
function aes(key, message) {
  const cipher = crypto.createCipheriv(`aes${key.length << 3}`, key, zero);
  const result = cipher.update(message);
  cipher.final();
  return result;
}
function getMessageBlock(message, blockIndex) {
  const block = Buffer.alloc(blockSize);
  const start = blockIndex * blockSize;
  const end = start + blockSize;
  message.copy(block, 0, start, end);
  return block;
}
function getPaddedMessageBlock(message, blockIndex) {
  const block = Buffer.alloc(blockSize);
  const start = blockIndex * blockSize;
  const end = message.length;
  block.fill(0);
  message.copy(block, 0, start, end);
  block[end - start] = 128;
  return block;
}
function generateSubkeys(key) {
  const l = aes(key, zero);
  let subkey1 = bitShiftLeft(l);
  if (l[0] & 128) {
    subkey1 = xor(subkey1, rb);
  }
  let subkey2 = bitShiftLeft(subkey1);
  if (subkey1[0] & 128) {
    subkey2 = xor(subkey2, rb);
  }
  return { subkey1, subkey2 };
}
function aesCmac(key, message) {
  const subkeys = generateSubkeys(key);
  let blockCount = Math.ceil(message.length / blockSize);
  let lastBlockCompleteFlag;
  let lastBlock;
  if (blockCount === 0) {
    blockCount = 1;
    lastBlockCompleteFlag = false;
  } else {
    lastBlockCompleteFlag = message.length % blockSize === 0;
  }
  const lastBlockIndex = blockCount - 1;
  if (lastBlockCompleteFlag) {
    lastBlock = xor(getMessageBlock(message, lastBlockIndex), subkeys.subkey1);
  } else {
    lastBlock = xor(getPaddedMessageBlock(message, lastBlockIndex), subkeys.subkey2);
  }
  let x = zero;
  let y;
  for (let index = 0; index < lastBlockIndex; index++) {
    y = xor(x, getMessageBlock(message, index));
    x = aes(key, y);
  }
  y = xor(lastBlock, x);
  return aes(key, y);
}
function getJwkAlgorithm(algorithm) {
  switch (algorithm.name.toUpperCase()) {
    case "RSA-OAEP": {
      const mdSize = /(\d+)$/.exec(algorithm.hash.name)[1];
      return `RSA-OAEP${mdSize !== "1" ? `-${mdSize}` : ""}`;
    }
    case "RSASSA-PKCS1-V1_5":
      return `RS${/(\d+)$/.exec(algorithm.hash.name)[1]}`;
    case "RSA-PSS":
      return `PS${/(\d+)$/.exec(algorithm.hash.name)[1]}`;
    case "RSA-PKCS1":
      return `RS1`;
    default:
      throw new OperationError("algorithm: Is not recognized");
  }
}
function getOidByNamedCurve$1(namedCurve) {
  const oid = namedOIDs[namedCurve];
  if (!oid) {
    throw new OperationError(`Cannot convert WebCrypto named curve '${namedCurve}' to OID`);
  }
  return oid;
}
function getOidByNamedCurve(namedCurve) {
  const oid = edOIDs[namedCurve.toLowerCase()];
  if (!oid) {
    throw new OperationError(`Cannot convert WebCrypto named curve '${namedCurve}' to OID`);
  }
  return oid;
}
var crypto, import_crypto, process2, JsonBase64UrlConverter, CryptoKey2, SymmetricKey, AsymmetricKey, AesCryptoKey, keyStorage, AesCrypto, AesCbcProvider2, zero, rb, blockSize, AesCmacProvider2, AesCtrProvider2, AesGcmProvider2, AesKwProvider2, AesEcbProvider2, DesCryptoKey, DesCrypto, DesCbcProvider, DesEde3CbcProvider, RsaPrivateKey2, RsaPublicKey2, RsaCrypto, RsaSsaProvider2, RsaPssProvider2, ShaCrypto, RsaOaepProvider2, RsaEsProvider, namedOIDs, EcPrivateKey2, EcPublicKey3, Sha1Provider, Sha256Provider, Sha384Provider, Sha512Provider, Sha3256Provider, Sha3384Provider, Sha3512Provider, EcCrypto, EcdsaProvider2, EcdhProvider2, edOIDs, EdPrivateKey3, EdPublicKey3, EdCrypto, EdDsaProvider2, EcdhEsProvider2, PbkdfCryptoKey, Pbkdf2Provider2, HmacCryptoKey, HmacProvider2, HkdfCryptoKey, HkdfProvider2, ShakeCrypto, Shake128Provider2, Shake256Provider2, SubtleCrypto2, Crypto2;
var init_webcrypto_es = __esm({
  "../../node_modules/.pnpm/@peculiar+webcrypto@1.4.0/node_modules/@peculiar/webcrypto/build/webcrypto.es.js"() {
    init_webcrypto_core_es();
    init_webcrypto_core_es();
    init_webcrypto_core_es();
    crypto = __toESM(require("crypto"));
    import_crypto = __toESM(require("crypto"));
    process2 = __toESM(require("process"));
    init_modules();
    init_index_es3();
    init_index_es();
    init_es2015();
    JsonBase64UrlConverter = {
      fromJSON: (value) => Buffer.from(Convert.FromBase64Url(value)),
      toJSON: (value) => Convert.ToBase64Url(value)
    };
    CryptoKey2 = class extends CryptoKey {
      constructor() {
        super(...arguments);
        this.data = Buffer.alloc(0);
        this.algorithm = { name: "" };
        this.extractable = false;
        this.type = "secret";
        this.usages = [];
        this.kty = "oct";
        this.alg = "";
      }
    };
    __name(CryptoKey2, "CryptoKey");
    __decorate([
      JsonProp({ name: "ext", type: JsonPropTypes.Boolean, optional: true })
    ], CryptoKey2.prototype, "extractable", void 0);
    __decorate([
      JsonProp({ name: "key_ops", type: JsonPropTypes.String, repeated: true, optional: true })
    ], CryptoKey2.prototype, "usages", void 0);
    __decorate([
      JsonProp({ type: JsonPropTypes.String })
    ], CryptoKey2.prototype, "kty", void 0);
    __decorate([
      JsonProp({ type: JsonPropTypes.String, optional: true })
    ], CryptoKey2.prototype, "alg", void 0);
    SymmetricKey = class extends CryptoKey2 {
      constructor() {
        super(...arguments);
        this.kty = "oct";
        this.type = "secret";
      }
    };
    __name(SymmetricKey, "SymmetricKey");
    AsymmetricKey = class extends CryptoKey2 {
    };
    __name(AsymmetricKey, "AsymmetricKey");
    AesCryptoKey = class extends SymmetricKey {
      get alg() {
        switch (this.algorithm.name.toUpperCase()) {
          case "AES-CBC":
            return `A${this.algorithm.length}CBC`;
          case "AES-CTR":
            return `A${this.algorithm.length}CTR`;
          case "AES-GCM":
            return `A${this.algorithm.length}GCM`;
          case "AES-KW":
            return `A${this.algorithm.length}KW`;
          case "AES-CMAC":
            return `A${this.algorithm.length}CMAC`;
          case "AES-ECB":
            return `A${this.algorithm.length}ECB`;
          default:
            throw new AlgorithmError("Unsupported algorithm name");
        }
      }
      set alg(value) {
      }
    };
    __name(AesCryptoKey, "AesCryptoKey");
    __decorate([
      JsonProp({ name: "k", converter: JsonBase64UrlConverter })
    ], AesCryptoKey.prototype, "data", void 0);
    keyStorage = /* @__PURE__ */ new WeakMap();
    __name(getCryptoKey, "getCryptoKey");
    __name(setCryptoKey, "setCryptoKey");
    AesCrypto = class {
      static async generateKey(algorithm, extractable, keyUsages) {
        const key = new AesCryptoKey();
        key.algorithm = algorithm;
        key.extractable = extractable;
        key.usages = keyUsages;
        key.data = import_crypto.default.randomBytes(algorithm.length >> 3);
        return key;
      }
      static async exportKey(format, key) {
        if (!(key instanceof AesCryptoKey)) {
          throw new Error("key: Is not AesCryptoKey");
        }
        switch (format.toLowerCase()) {
          case "jwk":
            return JsonSerializer.toJSON(key);
          case "raw":
            return new Uint8Array(key.data).buffer;
          default:
            throw new OperationError("format: Must be 'jwk' or 'raw'");
        }
      }
      static async importKey(format, keyData, algorithm, extractable, keyUsages) {
        let key;
        switch (format.toLowerCase()) {
          case "jwk":
            key = JsonParser.fromJSON(keyData, { targetSchema: AesCryptoKey });
            break;
          case "raw":
            key = new AesCryptoKey();
            key.data = Buffer.from(keyData);
            break;
          default:
            throw new OperationError("format: Must be 'jwk' or 'raw'");
        }
        key.algorithm = algorithm;
        key.algorithm.length = key.data.length << 3;
        key.extractable = extractable;
        key.usages = keyUsages;
        switch (key.algorithm.length) {
          case 128:
          case 192:
          case 256:
            break;
          default:
            throw new OperationError("keyData: Is wrong key length");
        }
        return key;
      }
      static async encrypt(algorithm, key, data) {
        switch (algorithm.name.toUpperCase()) {
          case "AES-CBC":
            return this.encryptAesCBC(algorithm, key, Buffer.from(data));
          case "AES-CTR":
            return this.encryptAesCTR(algorithm, key, Buffer.from(data));
          case "AES-GCM":
            return this.encryptAesGCM(algorithm, key, Buffer.from(data));
          case "AES-KW":
            return this.encryptAesKW(algorithm, key, Buffer.from(data));
          case "AES-ECB":
            return this.encryptAesECB(algorithm, key, Buffer.from(data));
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async decrypt(algorithm, key, data) {
        if (!(key instanceof AesCryptoKey)) {
          throw new Error("key: Is not AesCryptoKey");
        }
        switch (algorithm.name.toUpperCase()) {
          case "AES-CBC":
            return this.decryptAesCBC(algorithm, key, Buffer.from(data));
          case "AES-CTR":
            return this.decryptAesCTR(algorithm, key, Buffer.from(data));
          case "AES-GCM":
            return this.decryptAesGCM(algorithm, key, Buffer.from(data));
          case "AES-KW":
            return this.decryptAesKW(algorithm, key, Buffer.from(data));
          case "AES-ECB":
            return this.decryptAesECB(algorithm, key, Buffer.from(data));
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async encryptAesCBC(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`aes-${key.algorithm.length}-cbc`, key.data, new Uint8Array(algorithm.iv));
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final()]);
        const res = new Uint8Array(enc).buffer;
        return res;
      }
      static async decryptAesCBC(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`aes-${key.algorithm.length}-cbc`, key.data, new Uint8Array(algorithm.iv));
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
      static async encryptAesCTR(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`aes-${key.algorithm.length}-ctr`, key.data, Buffer.from(algorithm.counter));
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final()]);
        const res = new Uint8Array(enc).buffer;
        return res;
      }
      static async decryptAesCTR(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`aes-${key.algorithm.length}-ctr`, key.data, new Uint8Array(algorithm.counter));
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
      static async encryptAesGCM(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`aes-${key.algorithm.length}-gcm`, key.data, Buffer.from(algorithm.iv), {
          authTagLength: (algorithm.tagLength || 128) >> 3
        });
        if (algorithm.additionalData) {
          cipher.setAAD(Buffer.from(algorithm.additionalData));
        }
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final(), cipher.getAuthTag()]);
        const res = new Uint8Array(enc).buffer;
        return res;
      }
      static async decryptAesGCM(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`aes-${key.algorithm.length}-gcm`, key.data, new Uint8Array(algorithm.iv));
        const tagLength = (algorithm.tagLength || 128) >> 3;
        const enc = data.slice(0, data.length - tagLength);
        const tag = data.slice(data.length - tagLength);
        if (algorithm.additionalData) {
          decipher.setAAD(Buffer.from(algorithm.additionalData));
        }
        decipher.setAuthTag(tag);
        let dec = decipher.update(enc);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
      static async encryptAesKW(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`id-aes${key.algorithm.length}-wrap`, key.data, this.AES_KW_IV);
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final()]);
        return new Uint8Array(enc).buffer;
      }
      static async decryptAesKW(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`id-aes${key.algorithm.length}-wrap`, key.data, this.AES_KW_IV);
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
      static async encryptAesECB(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`aes-${key.algorithm.length}-ecb`, key.data, new Uint8Array(0));
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final()]);
        const res = new Uint8Array(enc).buffer;
        return res;
      }
      static async decryptAesECB(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`aes-${key.algorithm.length}-ecb`, key.data, new Uint8Array(0));
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
    };
    __name(AesCrypto, "AesCrypto");
    AesCrypto.AES_KW_IV = Buffer.from("A6A6A6A6A6A6A6A6", "hex");
    AesCbcProvider2 = class extends AesCbcProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await AesCrypto.generateKey({
          name: this.name,
          length: algorithm.length
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onEncrypt(algorithm, key, data) {
        return AesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return AesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return AesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await AesCrypto.importKey(format, keyData, { name: algorithm.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof AesCryptoKey)) {
          throw new TypeError("key: Is not a AesCryptoKey");
        }
      }
    };
    __name(AesCbcProvider2, "AesCbcProvider");
    zero = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    rb = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 135]);
    blockSize = 16;
    __name(bitShiftLeft, "bitShiftLeft");
    __name(xor, "xor");
    __name(aes, "aes");
    __name(getMessageBlock, "getMessageBlock");
    __name(getPaddedMessageBlock, "getPaddedMessageBlock");
    __name(generateSubkeys, "generateSubkeys");
    __name(aesCmac, "aesCmac");
    AesCmacProvider2 = class extends AesCmacProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await AesCrypto.generateKey({
          name: this.name,
          length: algorithm.length
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onSign(algorithm, key, data) {
        const result = aesCmac(getCryptoKey(key).data, Buffer.from(data));
        return new Uint8Array(result).buffer;
      }
      async onVerify(algorithm, key, signature, data) {
        const signature2 = await this.sign(algorithm, key, data);
        return Buffer.from(signature).compare(Buffer.from(signature2)) === 0;
      }
      async onExportKey(format, key) {
        return AesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const res = await AesCrypto.importKey(format, keyData, { name: algorithm.name }, extractable, keyUsages);
        return setCryptoKey(res);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof AesCryptoKey)) {
          throw new TypeError("key: Is not a AesCryptoKey");
        }
      }
    };
    __name(AesCmacProvider2, "AesCmacProvider");
    AesCtrProvider2 = class extends AesCtrProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await AesCrypto.generateKey({
          name: this.name,
          length: algorithm.length
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onEncrypt(algorithm, key, data) {
        return AesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return AesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return AesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const res = await AesCrypto.importKey(format, keyData, { name: algorithm.name }, extractable, keyUsages);
        return setCryptoKey(res);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof AesCryptoKey)) {
          throw new TypeError("key: Is not a AesCryptoKey");
        }
      }
    };
    __name(AesCtrProvider2, "AesCtrProvider");
    AesGcmProvider2 = class extends AesGcmProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await AesCrypto.generateKey({
          name: this.name,
          length: algorithm.length
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onEncrypt(algorithm, key, data) {
        return AesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return AesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return AesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const res = await AesCrypto.importKey(format, keyData, { name: algorithm.name }, extractable, keyUsages);
        return setCryptoKey(res);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof AesCryptoKey)) {
          throw new TypeError("key: Is not a AesCryptoKey");
        }
      }
    };
    __name(AesGcmProvider2, "AesGcmProvider");
    AesKwProvider2 = class extends AesKwProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const res = await AesCrypto.generateKey({
          name: this.name,
          length: algorithm.length
        }, extractable, keyUsages);
        return setCryptoKey(res);
      }
      async onExportKey(format, key) {
        return AesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const res = await AesCrypto.importKey(format, keyData, { name: algorithm.name }, extractable, keyUsages);
        return setCryptoKey(res);
      }
      async onEncrypt(algorithm, key, data) {
        return AesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return AesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof AesCryptoKey)) {
          throw new TypeError("key: Is not a AesCryptoKey");
        }
      }
    };
    __name(AesKwProvider2, "AesKwProvider");
    AesEcbProvider2 = class extends AesEcbProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await AesCrypto.generateKey({
          name: this.name,
          length: algorithm.length
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onEncrypt(algorithm, key, data) {
        return AesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return AesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return AesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const res = await AesCrypto.importKey(format, keyData, { name: algorithm.name }, extractable, keyUsages);
        return setCryptoKey(res);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof AesCryptoKey)) {
          throw new TypeError("key: Is not a AesCryptoKey");
        }
      }
    };
    __name(AesEcbProvider2, "AesEcbProvider");
    DesCryptoKey = class extends SymmetricKey {
      get alg() {
        switch (this.algorithm.name.toUpperCase()) {
          case "DES-CBC":
            return `DES-CBC`;
          case "DES-EDE3-CBC":
            return `3DES-CBC`;
          default:
            throw new AlgorithmError("Unsupported algorithm name");
        }
      }
      set alg(value) {
      }
    };
    __name(DesCryptoKey, "DesCryptoKey");
    __decorate([
      JsonProp({ name: "k", converter: JsonBase64UrlConverter })
    ], DesCryptoKey.prototype, "data", void 0);
    DesCrypto = class {
      static async generateKey(algorithm, extractable, keyUsages) {
        const key = new DesCryptoKey();
        key.algorithm = algorithm;
        key.extractable = extractable;
        key.usages = keyUsages;
        key.data = import_crypto.default.randomBytes(algorithm.length >> 3);
        return key;
      }
      static async exportKey(format, key) {
        switch (format.toLowerCase()) {
          case "jwk":
            return JsonSerializer.toJSON(key);
          case "raw":
            return new Uint8Array(key.data).buffer;
          default:
            throw new OperationError("format: Must be 'jwk' or 'raw'");
        }
      }
      static async importKey(format, keyData, algorithm, extractable, keyUsages) {
        let key;
        switch (format.toLowerCase()) {
          case "jwk":
            key = JsonParser.fromJSON(keyData, { targetSchema: DesCryptoKey });
            break;
          case "raw":
            key = new DesCryptoKey();
            key.data = Buffer.from(keyData);
            break;
          default:
            throw new OperationError("format: Must be 'jwk' or 'raw'");
        }
        key.algorithm = algorithm;
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
      static async encrypt(algorithm, key, data) {
        switch (algorithm.name.toUpperCase()) {
          case "DES-CBC":
            return this.encryptDesCBC(algorithm, key, Buffer.from(data));
          case "DES-EDE3-CBC":
            return this.encryptDesEDE3CBC(algorithm, key, Buffer.from(data));
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async decrypt(algorithm, key, data) {
        if (!(key instanceof DesCryptoKey)) {
          throw new Error("key: Is not DesCryptoKey");
        }
        switch (algorithm.name.toUpperCase()) {
          case "DES-CBC":
            return this.decryptDesCBC(algorithm, key, Buffer.from(data));
          case "DES-EDE3-CBC":
            return this.decryptDesEDE3CBC(algorithm, key, Buffer.from(data));
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async encryptDesCBC(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`des-cbc`, key.data, new Uint8Array(algorithm.iv));
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final()]);
        const res = new Uint8Array(enc).buffer;
        return res;
      }
      static async decryptDesCBC(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`des-cbc`, key.data, new Uint8Array(algorithm.iv));
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
      static async encryptDesEDE3CBC(algorithm, key, data) {
        const cipher = import_crypto.default.createCipheriv(`des-ede3-cbc`, key.data, Buffer.from(algorithm.iv));
        let enc = cipher.update(data);
        enc = Buffer.concat([enc, cipher.final()]);
        const res = new Uint8Array(enc).buffer;
        return res;
      }
      static async decryptDesEDE3CBC(algorithm, key, data) {
        const decipher = import_crypto.default.createDecipheriv(`des-ede3-cbc`, key.data, new Uint8Array(algorithm.iv));
        let dec = decipher.update(data);
        dec = Buffer.concat([dec, decipher.final()]);
        return new Uint8Array(dec).buffer;
      }
    };
    __name(DesCrypto, "DesCrypto");
    DesCbcProvider = class extends DesProvider {
      constructor() {
        super(...arguments);
        this.keySizeBits = 64;
        this.ivSize = 8;
        this.name = "DES-CBC";
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await DesCrypto.generateKey({
          name: this.name,
          length: this.keySizeBits
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onEncrypt(algorithm, key, data) {
        return DesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return DesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return DesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await DesCrypto.importKey(format, keyData, { name: this.name, length: this.keySizeBits }, extractable, keyUsages);
        if (key.data.length !== this.keySizeBits >> 3) {
          throw new OperationError("keyData: Wrong key size");
        }
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof DesCryptoKey)) {
          throw new TypeError("key: Is not a DesCryptoKey");
        }
      }
    };
    __name(DesCbcProvider, "DesCbcProvider");
    DesEde3CbcProvider = class extends DesProvider {
      constructor() {
        super(...arguments);
        this.keySizeBits = 192;
        this.ivSize = 8;
        this.name = "DES-EDE3-CBC";
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const key = await DesCrypto.generateKey({
          name: this.name,
          length: this.keySizeBits
        }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      async onEncrypt(algorithm, key, data) {
        return DesCrypto.encrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onDecrypt(algorithm, key, data) {
        return DesCrypto.decrypt(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return DesCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await DesCrypto.importKey(format, keyData, { name: this.name, length: this.keySizeBits }, extractable, keyUsages);
        if (key.data.length !== this.keySizeBits >> 3) {
          throw new OperationError("keyData: Wrong key size");
        }
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof DesCryptoKey)) {
          throw new TypeError("key: Is not a DesCryptoKey");
        }
      }
    };
    __name(DesEde3CbcProvider, "DesEde3CbcProvider");
    __name(getJwkAlgorithm, "getJwkAlgorithm");
    RsaPrivateKey2 = class extends AsymmetricKey {
      constructor() {
        super(...arguments);
        this.type = "private";
      }
      getKey() {
        const keyInfo = AsnParser.parse(this.data, index$1.PrivateKeyInfo);
        return AsnParser.parse(keyInfo.privateKey, index$1.RsaPrivateKey);
      }
      toJSON() {
        const key = this.getKey();
        const json = {
          kty: "RSA",
          alg: getJwkAlgorithm(this.algorithm),
          key_ops: this.usages,
          ext: this.extractable
        };
        return Object.assign(json, JsonSerializer.toJSON(key));
      }
      fromJSON(json) {
        const key = JsonParser.fromJSON(json, { targetSchema: index$1.RsaPrivateKey });
        const keyInfo = new index$1.PrivateKeyInfo();
        keyInfo.privateKeyAlgorithm.algorithm = "1.2.840.113549.1.1.1";
        keyInfo.privateKeyAlgorithm.parameters = null;
        keyInfo.privateKey = AsnSerializer.serialize(key);
        this.data = Buffer.from(AsnSerializer.serialize(keyInfo));
      }
    };
    __name(RsaPrivateKey2, "RsaPrivateKey");
    RsaPublicKey2 = class extends AsymmetricKey {
      constructor() {
        super(...arguments);
        this.type = "public";
      }
      getKey() {
        const keyInfo = AsnParser.parse(this.data, index$1.PublicKeyInfo);
        return AsnParser.parse(keyInfo.publicKey, index$1.RsaPublicKey);
      }
      toJSON() {
        const key = this.getKey();
        const json = {
          kty: "RSA",
          alg: getJwkAlgorithm(this.algorithm),
          key_ops: this.usages,
          ext: this.extractable
        };
        return Object.assign(json, JsonSerializer.toJSON(key));
      }
      fromJSON(json) {
        const key = JsonParser.fromJSON(json, { targetSchema: index$1.RsaPublicKey });
        const keyInfo = new index$1.PublicKeyInfo();
        keyInfo.publicKeyAlgorithm.algorithm = "1.2.840.113549.1.1.1";
        keyInfo.publicKeyAlgorithm.parameters = null;
        keyInfo.publicKey = AsnSerializer.serialize(key);
        this.data = Buffer.from(AsnSerializer.serialize(keyInfo));
      }
    };
    __name(RsaPublicKey2, "RsaPublicKey");
    RsaCrypto = class {
      static async generateKey(algorithm, extractable, keyUsages) {
        const privateKey = new RsaPrivateKey2();
        privateKey.algorithm = algorithm;
        privateKey.extractable = extractable;
        privateKey.usages = keyUsages.filter((usage) => this.privateKeyUsages.indexOf(usage) !== -1);
        const publicKey = new RsaPublicKey2();
        publicKey.algorithm = algorithm;
        publicKey.extractable = true;
        publicKey.usages = keyUsages.filter((usage) => this.publicKeyUsages.indexOf(usage) !== -1);
        const publicExponent = Buffer.concat([
          Buffer.alloc(4 - algorithm.publicExponent.byteLength, 0),
          Buffer.from(algorithm.publicExponent)
        ]).readInt32BE(0);
        const keys = import_crypto.default.generateKeyPairSync("rsa", {
          modulusLength: algorithm.modulusLength,
          publicExponent,
          publicKeyEncoding: {
            format: "der",
            type: "spki"
          },
          privateKeyEncoding: {
            format: "der",
            type: "pkcs8"
          }
        });
        privateKey.data = keys.privateKey;
        publicKey.data = keys.publicKey;
        const res = {
          privateKey,
          publicKey
        };
        return res;
      }
      static async exportKey(format, key) {
        switch (format.toLowerCase()) {
          case "jwk":
            return JsonSerializer.toJSON(key);
          case "pkcs8":
          case "spki":
            return new Uint8Array(key.data).buffer;
          default:
            throw new OperationError("format: Must be 'jwk', 'pkcs8' or 'spki'");
        }
      }
      static async importKey(format, keyData, algorithm, extractable, keyUsages) {
        switch (format.toLowerCase()) {
          case "jwk": {
            const jwk = keyData;
            if (jwk.d) {
              const asnKey = JsonParser.fromJSON(keyData, { targetSchema: index$1.RsaPrivateKey });
              return this.importPrivateKey(asnKey, algorithm, extractable, keyUsages);
            } else {
              const asnKey = JsonParser.fromJSON(keyData, { targetSchema: index$1.RsaPublicKey });
              return this.importPublicKey(asnKey, algorithm, extractable, keyUsages);
            }
          }
          case "spki": {
            const keyInfo = AsnParser.parse(new Uint8Array(keyData), index$1.PublicKeyInfo);
            const asnKey = AsnParser.parse(keyInfo.publicKey, index$1.RsaPublicKey);
            return this.importPublicKey(asnKey, algorithm, extractable, keyUsages);
          }
          case "pkcs8": {
            const keyInfo = AsnParser.parse(new Uint8Array(keyData), index$1.PrivateKeyInfo);
            const asnKey = AsnParser.parse(keyInfo.privateKey, index$1.RsaPrivateKey);
            return this.importPrivateKey(asnKey, algorithm, extractable, keyUsages);
          }
          default:
            throw new OperationError("format: Must be 'jwk', 'pkcs8' or 'spki'");
        }
      }
      static async sign(algorithm, key, data) {
        switch (algorithm.name.toUpperCase()) {
          case "RSA-PSS":
          case "RSASSA-PKCS1-V1_5":
            return this.signRsa(algorithm, key, data);
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async verify(algorithm, key, signature, data) {
        switch (algorithm.name.toUpperCase()) {
          case "RSA-PSS":
          case "RSASSA-PKCS1-V1_5":
            return this.verifySSA(algorithm, key, data, signature);
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async encrypt(algorithm, key, data) {
        switch (algorithm.name.toUpperCase()) {
          case "RSA-OAEP":
            return this.encryptOAEP(algorithm, key, data);
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static async decrypt(algorithm, key, data) {
        switch (algorithm.name.toUpperCase()) {
          case "RSA-OAEP":
            return this.decryptOAEP(algorithm, key, data);
          default:
            throw new OperationError("algorithm: Is not recognized");
        }
      }
      static importPrivateKey(asnKey, algorithm, extractable, keyUsages) {
        const keyInfo = new index$1.PrivateKeyInfo();
        keyInfo.privateKeyAlgorithm.algorithm = "1.2.840.113549.1.1.1";
        keyInfo.privateKeyAlgorithm.parameters = null;
        keyInfo.privateKey = AsnSerializer.serialize(asnKey);
        const key = new RsaPrivateKey2();
        key.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        key.algorithm = Object.assign({}, algorithm);
        key.algorithm.publicExponent = new Uint8Array(asnKey.publicExponent);
        key.algorithm.modulusLength = asnKey.modulus.byteLength << 3;
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
      static importPublicKey(asnKey, algorithm, extractable, keyUsages) {
        const keyInfo = new index$1.PublicKeyInfo();
        keyInfo.publicKeyAlgorithm.algorithm = "1.2.840.113549.1.1.1";
        keyInfo.publicKeyAlgorithm.parameters = null;
        keyInfo.publicKey = AsnSerializer.serialize(asnKey);
        const key = new RsaPublicKey2();
        key.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        key.algorithm = Object.assign({}, algorithm);
        key.algorithm.publicExponent = new Uint8Array(asnKey.publicExponent);
        key.algorithm.modulusLength = asnKey.modulus.byteLength << 3;
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
      static getCryptoAlgorithm(alg) {
        switch (alg.hash.name.toUpperCase()) {
          case "SHA-1":
            return "RSA-SHA1";
          case "SHA-256":
            return "RSA-SHA256";
          case "SHA-384":
            return "RSA-SHA384";
          case "SHA-512":
            return "RSA-SHA512";
          case "SHA3-256":
            return "RSA-SHA3-256";
          case "SHA3-384":
            return "RSA-SHA3-384";
          case "SHA3-512":
            return "RSA-SHA3-512";
          default:
            throw new OperationError("algorithm.hash: Is not recognized");
        }
      }
      static signRsa(algorithm, key, data) {
        const cryptoAlg = this.getCryptoAlgorithm(key.algorithm);
        const signer = import_crypto.default.createSign(cryptoAlg);
        signer.update(Buffer.from(data));
        if (!key.pem) {
          key.pem = `-----BEGIN PRIVATE KEY-----
${key.data.toString("base64")}
-----END PRIVATE KEY-----`;
        }
        const options = {
          key: key.pem
        };
        if (algorithm.name.toUpperCase() === "RSA-PSS") {
          options.padding = import_crypto.default.constants.RSA_PKCS1_PSS_PADDING;
          options.saltLength = algorithm.saltLength;
        }
        const signature = signer.sign(options);
        return new Uint8Array(signature).buffer;
      }
      static verifySSA(algorithm, key, data, signature) {
        const cryptoAlg = this.getCryptoAlgorithm(key.algorithm);
        const signer = import_crypto.default.createVerify(cryptoAlg);
        signer.update(Buffer.from(data));
        if (!key.pem) {
          key.pem = `-----BEGIN PUBLIC KEY-----
${key.data.toString("base64")}
-----END PUBLIC KEY-----`;
        }
        const options = {
          key: key.pem
        };
        if (algorithm.name.toUpperCase() === "RSA-PSS") {
          options.padding = import_crypto.default.constants.RSA_PKCS1_PSS_PADDING;
          options.saltLength = algorithm.saltLength;
        }
        const ok = signer.verify(options, signature);
        return ok;
      }
      static encryptOAEP(algorithm, key, data) {
        const options = {
          key: `-----BEGIN PUBLIC KEY-----
${key.data.toString("base64")}
-----END PUBLIC KEY-----`,
          padding: import_crypto.default.constants.RSA_PKCS1_OAEP_PADDING
        };
        if (algorithm.label)
          ;
        return new Uint8Array(import_crypto.default.publicEncrypt(options, data)).buffer;
      }
      static decryptOAEP(algorithm, key, data) {
        const options = {
          key: `-----BEGIN PRIVATE KEY-----
${key.data.toString("base64")}
-----END PRIVATE KEY-----`,
          padding: import_crypto.default.constants.RSA_PKCS1_OAEP_PADDING
        };
        if (algorithm.label)
          ;
        return new Uint8Array(import_crypto.default.privateDecrypt(options, data)).buffer;
      }
    };
    __name(RsaCrypto, "RsaCrypto");
    RsaCrypto.publicKeyUsages = ["verify", "encrypt", "wrapKey"];
    RsaCrypto.privateKeyUsages = ["sign", "decrypt", "unwrapKey"];
    RsaSsaProvider2 = class extends RsaSsaProvider {
      constructor() {
        super(...arguments);
        this.hashAlgorithms = [
          "SHA-1",
          "SHA-256",
          "SHA-384",
          "SHA-512",
          "shake128",
          "shake256",
          "SHA3-256",
          "SHA3-384",
          "SHA3-512"
        ];
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await RsaCrypto.generateKey({
          ...algorithm,
          name: this.name
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onSign(algorithm, key, data) {
        return RsaCrypto.sign(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onVerify(algorithm, key, signature, data) {
        return RsaCrypto.verify(algorithm, getCryptoKey(key), new Uint8Array(signature), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return RsaCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await RsaCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        const internalKey = getCryptoKey(key);
        if (!(internalKey instanceof RsaPrivateKey2 || internalKey instanceof RsaPublicKey2)) {
          throw new TypeError("key: Is not RSA CryptoKey");
        }
      }
    };
    __name(RsaSsaProvider2, "RsaSsaProvider");
    RsaPssProvider2 = class extends RsaPssProvider {
      constructor() {
        super(...arguments);
        this.hashAlgorithms = [
          "SHA-1",
          "SHA-256",
          "SHA-384",
          "SHA-512",
          "shake128",
          "shake256",
          "SHA3-256",
          "SHA3-384",
          "SHA3-512"
        ];
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await RsaCrypto.generateKey({
          ...algorithm,
          name: this.name
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onSign(algorithm, key, data) {
        return RsaCrypto.sign(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onVerify(algorithm, key, signature, data) {
        return RsaCrypto.verify(algorithm, getCryptoKey(key), new Uint8Array(signature), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return RsaCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await RsaCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        const internalKey = getCryptoKey(key);
        if (!(internalKey instanceof RsaPrivateKey2 || internalKey instanceof RsaPublicKey2)) {
          throw new TypeError("key: Is not RSA CryptoKey");
        }
      }
    };
    __name(RsaPssProvider2, "RsaPssProvider");
    ShaCrypto = class {
      static size(algorithm) {
        switch (algorithm.name.toUpperCase()) {
          case "SHA-1":
            return 160;
          case "SHA-256":
          case "SHA3-256":
            return 256;
          case "SHA-384":
          case "SHA3-384":
            return 384;
          case "SHA-512":
          case "SHA3-512":
            return 512;
          default:
            throw new Error("Unrecognized name");
        }
      }
      static getAlgorithmName(algorithm) {
        switch (algorithm.name.toUpperCase()) {
          case "SHA-1":
            return "sha1";
          case "SHA-256":
            return "sha256";
          case "SHA-384":
            return "sha384";
          case "SHA-512":
            return "sha512";
          case "SHA3-256":
            return "sha3-256";
          case "SHA3-384":
            return "sha3-384";
          case "SHA3-512":
            return "sha3-512";
          default:
            throw new Error("Unrecognized name");
        }
      }
      static digest(algorithm, data) {
        const hashAlg = this.getAlgorithmName(algorithm);
        const hash = import_crypto.default.createHash(hashAlg).update(Buffer.from(data)).digest();
        return new Uint8Array(hash).buffer;
      }
    };
    __name(ShaCrypto, "ShaCrypto");
    RsaOaepProvider2 = class extends RsaOaepProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await RsaCrypto.generateKey({
          ...algorithm,
          name: this.name
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onEncrypt(algorithm, key, data) {
        const internalKey = getCryptoKey(key);
        const dataView = new Uint8Array(data);
        const keySize = Math.ceil(internalKey.algorithm.modulusLength >> 3);
        const hashSize = ShaCrypto.size(internalKey.algorithm.hash) >> 3;
        const dataLength = dataView.byteLength;
        const psLength = keySize - dataLength - 2 * hashSize - 2;
        if (dataLength > keySize - 2 * hashSize - 2) {
          throw new Error("Data too large");
        }
        const message = new Uint8Array(keySize);
        const seed = message.subarray(1, hashSize + 1);
        const dataBlock = message.subarray(hashSize + 1);
        dataBlock.set(dataView, hashSize + psLength + 1);
        const labelHash = import_crypto.default.createHash(internalKey.algorithm.hash.name.replace("-", "")).update(BufferSourceConverter.toUint8Array(algorithm.label || new Uint8Array(0))).digest();
        dataBlock.set(labelHash, 0);
        dataBlock[hashSize + psLength] = 1;
        import_crypto.default.randomFillSync(seed);
        const dataBlockMask = this.mgf1(internalKey.algorithm.hash, seed, dataBlock.length);
        for (let i = 0; i < dataBlock.length; i++) {
          dataBlock[i] ^= dataBlockMask[i];
        }
        const seedMask = this.mgf1(internalKey.algorithm.hash, dataBlock, seed.length);
        for (let i = 0; i < seed.length; i++) {
          seed[i] ^= seedMask[i];
        }
        if (!internalKey.pem) {
          internalKey.pem = `-----BEGIN PUBLIC KEY-----
${internalKey.data.toString("base64")}
-----END PUBLIC KEY-----`;
        }
        const pkcs0 = import_crypto.default.publicEncrypt({
          key: internalKey.pem,
          padding: import_crypto.default.constants.RSA_NO_PADDING
        }, Buffer.from(message));
        return new Uint8Array(pkcs0).buffer;
      }
      async onDecrypt(algorithm, key, data) {
        const internalKey = getCryptoKey(key);
        const keySize = Math.ceil(internalKey.algorithm.modulusLength >> 3);
        const hashSize = ShaCrypto.size(internalKey.algorithm.hash) >> 3;
        const dataLength = data.byteLength;
        if (dataLength !== keySize) {
          throw new Error("Bad data");
        }
        if (!internalKey.pem) {
          internalKey.pem = `-----BEGIN PRIVATE KEY-----
${internalKey.data.toString("base64")}
-----END PRIVATE KEY-----`;
        }
        let pkcs0 = import_crypto.default.privateDecrypt({
          key: internalKey.pem,
          padding: import_crypto.default.constants.RSA_NO_PADDING
        }, Buffer.from(data));
        const z = pkcs0[0];
        const seed = pkcs0.subarray(1, hashSize + 1);
        const dataBlock = pkcs0.subarray(hashSize + 1);
        if (z !== 0) {
          throw new Error("Decryption failed");
        }
        const seedMask = this.mgf1(internalKey.algorithm.hash, dataBlock, seed.length);
        for (let i = 0; i < seed.length; i++) {
          seed[i] ^= seedMask[i];
        }
        const dataBlockMask = this.mgf1(internalKey.algorithm.hash, seed, dataBlock.length);
        for (let i = 0; i < dataBlock.length; i++) {
          dataBlock[i] ^= dataBlockMask[i];
        }
        const labelHash = import_crypto.default.createHash(internalKey.algorithm.hash.name.replace("-", "")).update(BufferSourceConverter.toUint8Array(algorithm.label || new Uint8Array(0))).digest();
        for (let i = 0; i < hashSize; i++) {
          if (labelHash[i] !== dataBlock[i]) {
            throw new Error("Decryption failed");
          }
        }
        let psEnd = hashSize;
        for (; psEnd < dataBlock.length; psEnd++) {
          const psz = dataBlock[psEnd];
          if (psz === 1) {
            break;
          }
          if (psz !== 0) {
            throw new Error("Decryption failed");
          }
        }
        if (psEnd === dataBlock.length) {
          throw new Error("Decryption failed");
        }
        pkcs0 = dataBlock.subarray(psEnd + 1);
        return new Uint8Array(pkcs0).buffer;
      }
      async onExportKey(format, key) {
        return RsaCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await RsaCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        const internalKey = getCryptoKey(key);
        if (!(internalKey instanceof RsaPrivateKey2 || internalKey instanceof RsaPublicKey2)) {
          throw new TypeError("key: Is not RSA CryptoKey");
        }
      }
      mgf1(algorithm, seed, length = 0) {
        const hashSize = ShaCrypto.size(algorithm) >> 3;
        const mask = new Uint8Array(length);
        const counter = new Uint8Array(4);
        const chunks = Math.ceil(length / hashSize);
        for (let i = 0; i < chunks; i++) {
          counter[0] = i >>> 24;
          counter[1] = i >>> 16 & 255;
          counter[2] = i >>> 8 & 255;
          counter[3] = i & 255;
          const submask = mask.subarray(i * hashSize);
          let chunk = import_crypto.default.createHash(algorithm.name.replace("-", "")).update(seed).update(counter).digest();
          if (chunk.length > submask.length) {
            chunk = chunk.subarray(0, submask.length);
          }
          submask.set(chunk);
        }
        return mask;
      }
    };
    __name(RsaOaepProvider2, "RsaOaepProvider");
    RsaEsProvider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "RSAES-PKCS1-v1_5";
        this.usages = {
          publicKey: ["encrypt", "wrapKey"],
          privateKey: ["decrypt", "unwrapKey"]
        };
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await RsaCrypto.generateKey({
          ...algorithm,
          name: this.name
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      checkGenerateKeyParams(algorithm) {
        this.checkRequiredProperty(algorithm, "publicExponent");
        if (!(algorithm.publicExponent && algorithm.publicExponent instanceof Uint8Array)) {
          throw new TypeError("publicExponent: Missing or not a Uint8Array");
        }
        const publicExponent = Convert.ToBase64(algorithm.publicExponent);
        if (!(publicExponent === "Aw==" || publicExponent === "AQAB")) {
          throw new TypeError("publicExponent: Must be [3] or [1,0,1]");
        }
        this.checkRequiredProperty(algorithm, "modulusLength");
        switch (algorithm.modulusLength) {
          case 1024:
          case 2048:
          case 4096:
            break;
          default:
            throw new TypeError("modulusLength: Must be 1024, 2048, or 4096");
        }
      }
      async onEncrypt(algorithm, key, data) {
        const options = this.toCryptoOptions(key);
        const enc = crypto.publicEncrypt(options, new Uint8Array(data));
        return new Uint8Array(enc).buffer;
      }
      async onDecrypt(algorithm, key, data) {
        const options = this.toCryptoOptions(key);
        const dec = crypto.privateDecrypt(options, new Uint8Array(data));
        return new Uint8Array(dec).buffer;
      }
      async onExportKey(format, key) {
        return RsaCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await RsaCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        const internalKey = getCryptoKey(key);
        if (!(internalKey instanceof RsaPrivateKey2 || internalKey instanceof RsaPublicKey2)) {
          throw new TypeError("key: Is not RSA CryptoKey");
        }
      }
      toCryptoOptions(key) {
        const type = key.type.toUpperCase();
        return {
          key: `-----BEGIN ${type} KEY-----
${getCryptoKey(key).data.toString("base64")}
-----END ${type} KEY-----`,
          padding: crypto.constants.RSA_PKCS1_PADDING
        };
      }
    };
    __name(RsaEsProvider, "RsaEsProvider");
    namedOIDs = {
      "1.2.840.10045.3.1.7": "P-256",
      "P-256": "1.2.840.10045.3.1.7",
      "1.3.132.0.34": "P-384",
      "P-384": "1.3.132.0.34",
      "1.3.132.0.35": "P-521",
      "P-521": "1.3.132.0.35",
      "1.3.132.0.10": "K-256",
      "K-256": "1.3.132.0.10",
      "brainpoolP160r1": "1.3.36.3.3.2.8.1.1.1",
      "1.3.36.3.3.2.8.1.1.1": "brainpoolP160r1",
      "brainpoolP160t1": "1.3.36.3.3.2.8.1.1.2",
      "1.3.36.3.3.2.8.1.1.2": "brainpoolP160t1",
      "brainpoolP192r1": "1.3.36.3.3.2.8.1.1.3",
      "1.3.36.3.3.2.8.1.1.3": "brainpoolP192r1",
      "brainpoolP192t1": "1.3.36.3.3.2.8.1.1.4",
      "1.3.36.3.3.2.8.1.1.4": "brainpoolP192t1",
      "brainpoolP224r1": "1.3.36.3.3.2.8.1.1.5",
      "1.3.36.3.3.2.8.1.1.5": "brainpoolP224r1",
      "brainpoolP224t1": "1.3.36.3.3.2.8.1.1.6",
      "1.3.36.3.3.2.8.1.1.6": "brainpoolP224t1",
      "brainpoolP256r1": "1.3.36.3.3.2.8.1.1.7",
      "1.3.36.3.3.2.8.1.1.7": "brainpoolP256r1",
      "brainpoolP256t1": "1.3.36.3.3.2.8.1.1.8",
      "1.3.36.3.3.2.8.1.1.8": "brainpoolP256t1",
      "brainpoolP320r1": "1.3.36.3.3.2.8.1.1.9",
      "1.3.36.3.3.2.8.1.1.9": "brainpoolP320r1",
      "brainpoolP320t1": "1.3.36.3.3.2.8.1.1.10",
      "1.3.36.3.3.2.8.1.1.10": "brainpoolP320t1",
      "brainpoolP384r1": "1.3.36.3.3.2.8.1.1.11",
      "1.3.36.3.3.2.8.1.1.11": "brainpoolP384r1",
      "brainpoolP384t1": "1.3.36.3.3.2.8.1.1.12",
      "1.3.36.3.3.2.8.1.1.12": "brainpoolP384t1",
      "brainpoolP512r1": "1.3.36.3.3.2.8.1.1.13",
      "1.3.36.3.3.2.8.1.1.13": "brainpoolP512r1",
      "brainpoolP512t1": "1.3.36.3.3.2.8.1.1.14",
      "1.3.36.3.3.2.8.1.1.14": "brainpoolP512t1"
    };
    __name(getOidByNamedCurve$1, "getOidByNamedCurve$1");
    EcPrivateKey2 = class extends AsymmetricKey {
      constructor() {
        super(...arguments);
        this.type = "private";
      }
      getKey() {
        const keyInfo = AsnParser.parse(this.data, index$1.PrivateKeyInfo);
        return AsnParser.parse(keyInfo.privateKey, index$1.EcPrivateKey);
      }
      toJSON() {
        const key = this.getKey();
        const json = {
          kty: "EC",
          crv: this.algorithm.namedCurve,
          key_ops: this.usages,
          ext: this.extractable
        };
        return Object.assign(json, JsonSerializer.toJSON(key));
      }
      fromJSON(json) {
        if (!json.crv) {
          throw new OperationError(`Cannot get named curve from JWK. Property 'crv' is required`);
        }
        const keyInfo = new index$1.PrivateKeyInfo();
        keyInfo.privateKeyAlgorithm.algorithm = "1.2.840.10045.2.1";
        keyInfo.privateKeyAlgorithm.parameters = AsnSerializer.serialize(new index$1.ObjectIdentifier(getOidByNamedCurve$1(json.crv)));
        const key = JsonParser.fromJSON(json, { targetSchema: index$1.EcPrivateKey });
        keyInfo.privateKey = AsnSerializer.serialize(key);
        this.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        return this;
      }
    };
    __name(EcPrivateKey2, "EcPrivateKey");
    EcPublicKey3 = class extends AsymmetricKey {
      constructor() {
        super(...arguments);
        this.type = "public";
      }
      getKey() {
        const keyInfo = AsnParser.parse(this.data, index$1.PublicKeyInfo);
        return new index$1.EcPublicKey(keyInfo.publicKey);
      }
      toJSON() {
        const key = this.getKey();
        const json = {
          kty: "EC",
          crv: this.algorithm.namedCurve,
          key_ops: this.usages,
          ext: this.extractable
        };
        return Object.assign(json, JsonSerializer.toJSON(key));
      }
      fromJSON(json) {
        if (!json.crv) {
          throw new OperationError(`Cannot get named curve from JWK. Property 'crv' is required`);
        }
        const key = JsonParser.fromJSON(json, { targetSchema: index$1.EcPublicKey });
        const keyInfo = new index$1.PublicKeyInfo();
        keyInfo.publicKeyAlgorithm.algorithm = "1.2.840.10045.2.1";
        keyInfo.publicKeyAlgorithm.parameters = AsnSerializer.serialize(new index$1.ObjectIdentifier(getOidByNamedCurve$1(json.crv)));
        keyInfo.publicKey = AsnSerializer.toASN(key).valueHex;
        this.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        return this;
      }
    };
    __name(EcPublicKey3, "EcPublicKey");
    Sha1Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA-1";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha1Provider, "Sha1Provider");
    Sha256Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA-256";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha256Provider, "Sha256Provider");
    Sha384Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA-384";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha384Provider, "Sha384Provider");
    Sha512Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA-512";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha512Provider, "Sha512Provider");
    Sha3256Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA3-256";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha3256Provider, "Sha3256Provider");
    Sha3384Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA3-384";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha3384Provider, "Sha3384Provider");
    Sha3512Provider = class extends ProviderCrypto {
      constructor() {
        super(...arguments);
        this.name = "SHA3-512";
        this.usages = [];
      }
      async onDigest(algorithm, data) {
        return ShaCrypto.digest(algorithm, data);
      }
    };
    __name(Sha3512Provider, "Sha3512Provider");
    EcCrypto = class {
      static async generateKey(algorithm, extractable, keyUsages) {
        const privateKey = new EcPrivateKey2();
        privateKey.algorithm = algorithm;
        privateKey.extractable = extractable;
        privateKey.usages = keyUsages.filter((usage) => this.privateKeyUsages.indexOf(usage) !== -1);
        const publicKey = new EcPublicKey3();
        publicKey.algorithm = algorithm;
        publicKey.extractable = true;
        publicKey.usages = keyUsages.filter((usage) => this.publicKeyUsages.indexOf(usage) !== -1);
        const keys = import_crypto.default.generateKeyPairSync("ec", {
          namedCurve: this.getOpenSSLNamedCurve(algorithm.namedCurve),
          publicKeyEncoding: {
            format: "der",
            type: "spki"
          },
          privateKeyEncoding: {
            format: "der",
            type: "pkcs8"
          }
        });
        privateKey.data = keys.privateKey;
        publicKey.data = keys.publicKey;
        const res = {
          privateKey,
          publicKey
        };
        return res;
      }
      static async sign(algorithm, key, data) {
        const cryptoAlg = ShaCrypto.getAlgorithmName(algorithm.hash);
        const signer = import_crypto.default.createSign(cryptoAlg);
        signer.update(Buffer.from(data));
        if (!key.pem) {
          key.pem = `-----BEGIN PRIVATE KEY-----
${key.data.toString("base64")}
-----END PRIVATE KEY-----`;
        }
        const options = {
          key: key.pem
        };
        const signature = signer.sign(options);
        const ecSignature = AsnParser.parse(signature, index$1.EcDsaSignature);
        const signatureRaw = EcUtils.encodeSignature(ecSignature, EcCurves.get(key.algorithm.namedCurve).size);
        return signatureRaw.buffer;
      }
      static async verify(algorithm, key, signature, data) {
        const cryptoAlg = ShaCrypto.getAlgorithmName(algorithm.hash);
        const signer = import_crypto.default.createVerify(cryptoAlg);
        signer.update(Buffer.from(data));
        if (!key.pem) {
          key.pem = `-----BEGIN PUBLIC KEY-----
${key.data.toString("base64")}
-----END PUBLIC KEY-----`;
        }
        const options = {
          key: key.pem
        };
        const ecSignature = new index$1.EcDsaSignature();
        const namedCurve = EcCurves.get(key.algorithm.namedCurve);
        const signaturePoint = EcUtils.decodeSignature(signature, namedCurve.size);
        ecSignature.r = BufferSourceConverter.toArrayBuffer(signaturePoint.r);
        ecSignature.s = BufferSourceConverter.toArrayBuffer(signaturePoint.s);
        const ecSignatureRaw = Buffer.from(AsnSerializer.serialize(ecSignature));
        const ok = signer.verify(options, ecSignatureRaw);
        return ok;
      }
      static async deriveBits(algorithm, baseKey, length) {
        const cryptoAlg = this.getOpenSSLNamedCurve(baseKey.algorithm.namedCurve);
        const ecdh = import_crypto.default.createECDH(cryptoAlg);
        const asnPrivateKey = AsnParser.parse(baseKey.data, index$1.PrivateKeyInfo);
        const asnEcPrivateKey = AsnParser.parse(asnPrivateKey.privateKey, index$1.EcPrivateKey);
        ecdh.setPrivateKey(Buffer.from(asnEcPrivateKey.privateKey));
        const asnPublicKey = AsnParser.parse(algorithm.public.data, index$1.PublicKeyInfo);
        const bits = ecdh.computeSecret(Buffer.from(asnPublicKey.publicKey));
        return new Uint8Array(bits).buffer.slice(0, length >> 3);
      }
      static async exportKey(format, key) {
        switch (format.toLowerCase()) {
          case "jwk":
            return JsonSerializer.toJSON(key);
          case "pkcs8":
          case "spki":
            return new Uint8Array(key.data).buffer;
          case "raw": {
            const publicKeyInfo = AsnParser.parse(key.data, index$1.PublicKeyInfo);
            return publicKeyInfo.publicKey;
          }
          default:
            throw new OperationError("format: Must be 'jwk', 'raw', pkcs8' or 'spki'");
        }
      }
      static async importKey(format, keyData, algorithm, extractable, keyUsages) {
        switch (format.toLowerCase()) {
          case "jwk": {
            const jwk = keyData;
            if (jwk.d) {
              const asnKey = JsonParser.fromJSON(keyData, { targetSchema: index$1.EcPrivateKey });
              return this.importPrivateKey(asnKey, algorithm, extractable, keyUsages);
            } else {
              const asnKey = JsonParser.fromJSON(keyData, { targetSchema: index$1.EcPublicKey });
              return this.importPublicKey(asnKey, algorithm, extractable, keyUsages);
            }
          }
          case "raw": {
            const asnKey = new index$1.EcPublicKey(keyData);
            return this.importPublicKey(asnKey, algorithm, extractable, keyUsages);
          }
          case "spki": {
            const keyInfo = AsnParser.parse(new Uint8Array(keyData), index$1.PublicKeyInfo);
            const asnKey = new index$1.EcPublicKey(keyInfo.publicKey);
            this.assertKeyParameters(keyInfo.publicKeyAlgorithm.parameters, algorithm.namedCurve);
            return this.importPublicKey(asnKey, algorithm, extractable, keyUsages);
          }
          case "pkcs8": {
            const keyInfo = AsnParser.parse(new Uint8Array(keyData), index$1.PrivateKeyInfo);
            const asnKey = AsnParser.parse(keyInfo.privateKey, index$1.EcPrivateKey);
            this.assertKeyParameters(keyInfo.privateKeyAlgorithm.parameters, algorithm.namedCurve);
            return this.importPrivateKey(asnKey, algorithm, extractable, keyUsages);
          }
          default:
            throw new OperationError("format: Must be 'jwk', 'raw', 'pkcs8' or 'spki'");
        }
      }
      static assertKeyParameters(parameters, namedCurve) {
        if (!parameters) {
          throw new CryptoError("Key info doesn't have required parameters");
        }
        let namedCurveIdentifier = "";
        try {
          namedCurveIdentifier = AsnParser.parse(parameters, index$1.ObjectIdentifier).value;
        } catch (e) {
          throw new CryptoError("Cannot read key info parameters");
        }
        if (getOidByNamedCurve$1(namedCurve) !== namedCurveIdentifier) {
          throw new CryptoError("Key info parameter doesn't match to named curve");
        }
      }
      static async importPrivateKey(asnKey, algorithm, extractable, keyUsages) {
        const keyInfo = new index$1.PrivateKeyInfo();
        keyInfo.privateKeyAlgorithm.algorithm = "1.2.840.10045.2.1";
        keyInfo.privateKeyAlgorithm.parameters = AsnSerializer.serialize(new index$1.ObjectIdentifier(getOidByNamedCurve$1(algorithm.namedCurve)));
        keyInfo.privateKey = AsnSerializer.serialize(asnKey);
        const key = new EcPrivateKey2();
        key.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        key.algorithm = Object.assign({}, algorithm);
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
      static async importPublicKey(asnKey, algorithm, extractable, keyUsages) {
        const keyInfo = new index$1.PublicKeyInfo();
        keyInfo.publicKeyAlgorithm.algorithm = "1.2.840.10045.2.1";
        const namedCurve = getOidByNamedCurve$1(algorithm.namedCurve);
        keyInfo.publicKeyAlgorithm.parameters = AsnSerializer.serialize(new index$1.ObjectIdentifier(namedCurve));
        keyInfo.publicKey = asnKey.value;
        const key = new EcPublicKey3();
        key.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        key.algorithm = Object.assign({}, algorithm);
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
      static getOpenSSLNamedCurve(curve) {
        switch (curve.toUpperCase()) {
          case "P-256":
            return "prime256v1";
          case "K-256":
            return "secp256k1";
          case "P-384":
            return "secp384r1";
          case "P-521":
            return "secp521r1";
          default:
            return curve;
        }
      }
    };
    __name(EcCrypto, "EcCrypto");
    EcCrypto.publicKeyUsages = ["verify"];
    EcCrypto.privateKeyUsages = ["sign", "deriveKey", "deriveBits"];
    EcdsaProvider2 = class extends EcdsaProvider {
      constructor() {
        super(...arguments);
        this.namedCurves = EcCurves.names;
        this.hashAlgorithms = [
          "SHA-1",
          "SHA-256",
          "SHA-384",
          "SHA-512",
          "shake128",
          "shake256",
          "SHA3-256",
          "SHA3-384",
          "SHA3-512"
        ];
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await EcCrypto.generateKey({
          ...algorithm,
          name: this.name
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onSign(algorithm, key, data) {
        return EcCrypto.sign(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onVerify(algorithm, key, signature, data) {
        return EcCrypto.verify(algorithm, getCryptoKey(key), new Uint8Array(signature), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return EcCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await EcCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        const internalKey = getCryptoKey(key);
        if (!(internalKey instanceof EcPrivateKey2 || internalKey instanceof EcPublicKey3)) {
          throw new TypeError("key: Is not EC CryptoKey");
        }
      }
    };
    __name(EcdsaProvider2, "EcdsaProvider");
    EcdhProvider2 = class extends EcdhProvider {
      constructor() {
        super(...arguments);
        this.namedCurves = EcCurves.names;
      }
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await EcCrypto.generateKey({
          ...algorithm,
          name: this.name
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onExportKey(format, key) {
        return EcCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await EcCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        const internalKey = getCryptoKey(key);
        if (!(internalKey instanceof EcPrivateKey2 || internalKey instanceof EcPublicKey3)) {
          throw new TypeError("key: Is not EC CryptoKey");
        }
      }
      async onDeriveBits(algorithm, baseKey, length) {
        const bits = await EcCrypto.deriveBits({ ...algorithm, public: getCryptoKey(algorithm.public) }, getCryptoKey(baseKey), length);
        return bits;
      }
    };
    __name(EcdhProvider2, "EcdhProvider");
    edOIDs = {
      [index$1.idEd448]: "Ed448",
      "ed448": index$1.idEd448,
      [index$1.idX448]: "X448",
      "x448": index$1.idX448,
      [index$1.idEd25519]: "Ed25519",
      "ed25519": index$1.idEd25519,
      [index$1.idX25519]: "X25519",
      "x25519": index$1.idX25519
    };
    __name(getOidByNamedCurve, "getOidByNamedCurve");
    EdPrivateKey3 = class extends AsymmetricKey {
      constructor() {
        super(...arguments);
        this.type = "private";
      }
      getKey() {
        const keyInfo = AsnParser.parse(this.data, index$1.PrivateKeyInfo);
        return AsnParser.parse(keyInfo.privateKey, index$1.CurvePrivateKey);
      }
      toJSON() {
        const key = this.getKey();
        const json = {
          kty: "OKP",
          crv: this.algorithm.namedCurve,
          key_ops: this.usages,
          ext: this.extractable
        };
        return Object.assign(json, JsonSerializer.toJSON(key));
      }
      fromJSON(json) {
        if (!json.crv) {
          throw new OperationError(`Cannot get named curve from JWK. Property 'crv' is required`);
        }
        const keyInfo = new index$1.PrivateKeyInfo();
        keyInfo.privateKeyAlgorithm.algorithm = getOidByNamedCurve(json.crv);
        const key = JsonParser.fromJSON(json, { targetSchema: index$1.CurvePrivateKey });
        keyInfo.privateKey = AsnSerializer.serialize(key);
        this.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        return this;
      }
    };
    __name(EdPrivateKey3, "EdPrivateKey");
    EdPublicKey3 = class extends AsymmetricKey {
      constructor() {
        super(...arguments);
        this.type = "public";
      }
      getKey() {
        const keyInfo = AsnParser.parse(this.data, index$1.PublicKeyInfo);
        return keyInfo.publicKey;
      }
      toJSON() {
        const key = this.getKey();
        const json = {
          kty: "OKP",
          crv: this.algorithm.namedCurve,
          key_ops: this.usages,
          ext: this.extractable
        };
        return Object.assign(json, {
          x: Convert.ToBase64Url(key)
        });
      }
      fromJSON(json) {
        if (!json.crv) {
          throw new OperationError(`Cannot get named curve from JWK. Property 'crv' is required`);
        }
        if (!json.x) {
          throw new OperationError(`Cannot get property from JWK. Property 'x' is required`);
        }
        const keyInfo = new index$1.PublicKeyInfo();
        keyInfo.publicKeyAlgorithm.algorithm = getOidByNamedCurve(json.crv);
        keyInfo.publicKey = Convert.FromBase64Url(json.x);
        this.data = Buffer.from(AsnSerializer.serialize(keyInfo));
        return this;
      }
    };
    __name(EdPublicKey3, "EdPublicKey");
    EdCrypto = class {
      static async generateKey(algorithm, extractable, keyUsages) {
        const privateKey = new EdPrivateKey3();
        privateKey.algorithm = algorithm;
        privateKey.extractable = extractable;
        privateKey.usages = keyUsages.filter((usage) => this.privateKeyUsages.indexOf(usage) !== -1);
        const publicKey = new EdPublicKey3();
        publicKey.algorithm = algorithm;
        publicKey.extractable = true;
        publicKey.usages = keyUsages.filter((usage) => this.publicKeyUsages.indexOf(usage) !== -1);
        const type = algorithm.namedCurve.toLowerCase();
        const keys = import_crypto.default.generateKeyPairSync(type, {
          publicKeyEncoding: {
            format: "der",
            type: "spki"
          },
          privateKeyEncoding: {
            format: "der",
            type: "pkcs8"
          }
        });
        privateKey.data = keys.privateKey;
        publicKey.data = keys.publicKey;
        const res = {
          privateKey,
          publicKey
        };
        return res;
      }
      static async sign(algorithm, key, data) {
        if (!key.pem) {
          key.pem = `-----BEGIN PRIVATE KEY-----
${key.data.toString("base64")}
-----END PRIVATE KEY-----`;
        }
        const options = {
          key: key.pem
        };
        const signature = import_crypto.default.sign(null, Buffer.from(data), options);
        return BufferSourceConverter.toArrayBuffer(signature);
      }
      static async verify(algorithm, key, signature, data) {
        if (!key.pem) {
          key.pem = `-----BEGIN PUBLIC KEY-----
${key.data.toString("base64")}
-----END PUBLIC KEY-----`;
        }
        const options = {
          key: key.pem
        };
        const ok = import_crypto.default.verify(null, Buffer.from(data), options, Buffer.from(signature));
        return ok;
      }
      static async deriveBits(algorithm, baseKey, length) {
        const publicKey = import_crypto.default.createPublicKey({
          key: algorithm.public.data,
          format: "der",
          type: "spki"
        });
        const privateKey = import_crypto.default.createPrivateKey({
          key: baseKey.data,
          format: "der",
          type: "pkcs8"
        });
        const bits = import_crypto.default.diffieHellman({
          publicKey,
          privateKey
        });
        return new Uint8Array(bits).buffer.slice(0, length >> 3);
      }
      static async exportKey(format, key) {
        switch (format.toLowerCase()) {
          case "jwk":
            return JsonSerializer.toJSON(key);
          case "pkcs8":
          case "spki":
            return new Uint8Array(key.data).buffer;
          case "raw": {
            const publicKeyInfo = AsnParser.parse(key.data, index$1.PublicKeyInfo);
            return publicKeyInfo.publicKey;
          }
          default:
            throw new OperationError("format: Must be 'jwk', 'raw', pkcs8' or 'spki'");
        }
      }
      static async importKey(format, keyData, algorithm, extractable, keyUsages) {
        switch (format.toLowerCase()) {
          case "jwk": {
            const jwk = keyData;
            if (jwk.d) {
              const asnKey = JsonParser.fromJSON(keyData, { targetSchema: index$1.CurvePrivateKey });
              return this.importPrivateKey(asnKey, algorithm, extractable, keyUsages);
            } else {
              if (!jwk.x) {
                throw new TypeError("keyData: Cannot get required 'x' filed");
              }
              return this.importPublicKey(Convert.FromBase64Url(jwk.x), algorithm, extractable, keyUsages);
            }
          }
          case "raw": {
            return this.importPublicKey(keyData, algorithm, extractable, keyUsages);
          }
          case "spki": {
            const keyInfo = AsnParser.parse(new Uint8Array(keyData), index$1.PublicKeyInfo);
            return this.importPublicKey(keyInfo.publicKey, algorithm, extractable, keyUsages);
          }
          case "pkcs8": {
            const keyInfo = AsnParser.parse(new Uint8Array(keyData), index$1.PrivateKeyInfo);
            const asnKey = AsnParser.parse(keyInfo.privateKey, index$1.CurvePrivateKey);
            return this.importPrivateKey(asnKey, algorithm, extractable, keyUsages);
          }
          default:
            throw new OperationError("format: Must be 'jwk', 'raw', 'pkcs8' or 'spki'");
        }
      }
      static importPrivateKey(asnKey, algorithm, extractable, keyUsages) {
        const key = new EdPrivateKey3();
        key.fromJSON({
          crv: algorithm.namedCurve,
          d: Convert.ToBase64Url(asnKey.d)
        });
        key.algorithm = Object.assign({}, algorithm);
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
      static async importPublicKey(asnKey, algorithm, extractable, keyUsages) {
        const key = new EdPublicKey3();
        key.fromJSON({
          crv: algorithm.namedCurve,
          x: Convert.ToBase64Url(asnKey)
        });
        key.algorithm = Object.assign({}, algorithm);
        key.extractable = extractable;
        key.usages = keyUsages;
        return key;
      }
    };
    __name(EdCrypto, "EdCrypto");
    EdCrypto.publicKeyUsages = ["verify"];
    EdCrypto.privateKeyUsages = ["sign", "deriveKey", "deriveBits"];
    EdDsaProvider2 = class extends EdDsaProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await EdCrypto.generateKey({
          name: this.name,
          namedCurve: algorithm.namedCurve.replace(/^ed/i, "Ed")
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onSign(algorithm, key, data) {
        return EdCrypto.sign(algorithm, getCryptoKey(key), new Uint8Array(data));
      }
      async onVerify(algorithm, key, signature, data) {
        return EdCrypto.verify(algorithm, getCryptoKey(key), new Uint8Array(signature), new Uint8Array(data));
      }
      async onExportKey(format, key) {
        return EdCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await EdCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
    };
    __name(EdDsaProvider2, "EdDsaProvider");
    EcdhEsProvider2 = class extends EcdhEsProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const keys = await EdCrypto.generateKey({
          name: this.name,
          namedCurve: algorithm.namedCurve.toUpperCase()
        }, extractable, keyUsages);
        return {
          privateKey: setCryptoKey(keys.privateKey),
          publicKey: setCryptoKey(keys.publicKey)
        };
      }
      async onDeriveBits(algorithm, baseKey, length) {
        const bits = await EdCrypto.deriveBits({ ...algorithm, public: getCryptoKey(algorithm.public) }, getCryptoKey(baseKey), length);
        return bits;
      }
      async onExportKey(format, key) {
        return EdCrypto.exportKey(format, getCryptoKey(key));
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        const key = await EdCrypto.importKey(format, keyData, { ...algorithm, name: this.name }, extractable, keyUsages);
        return setCryptoKey(key);
      }
    };
    __name(EcdhEsProvider2, "EcdhEsProvider");
    PbkdfCryptoKey = class extends CryptoKey2 {
    };
    __name(PbkdfCryptoKey, "PbkdfCryptoKey");
    Pbkdf2Provider2 = class extends Pbkdf2Provider {
      async onDeriveBits(algorithm, baseKey, length) {
        return new Promise((resolve, reject) => {
          const salt = BufferSourceConverter.toArrayBuffer(algorithm.salt);
          const hash = algorithm.hash.name.replace("-", "");
          import_crypto.default.pbkdf2(getCryptoKey(baseKey).data, Buffer.from(salt), algorithm.iterations, length >> 3, hash, (err, derivedBits) => {
            if (err) {
              reject(err);
            } else {
              resolve(new Uint8Array(derivedBits).buffer);
            }
          });
        });
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        if (format === "raw") {
          const key = new PbkdfCryptoKey();
          key.data = Buffer.from(keyData);
          key.algorithm = { name: this.name };
          key.extractable = false;
          key.usages = keyUsages;
          return setCryptoKey(key);
        }
        throw new OperationError("format: Must be 'raw'");
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof PbkdfCryptoKey)) {
          throw new TypeError("key: Is not PBKDF CryptoKey");
        }
      }
    };
    __name(Pbkdf2Provider2, "Pbkdf2Provider");
    HmacCryptoKey = class extends CryptoKey2 {
      get alg() {
        const hash = this.algorithm.hash.name.toUpperCase();
        return `HS${hash.replace("SHA-", "")}`;
      }
      set alg(value) {
      }
    };
    __name(HmacCryptoKey, "HmacCryptoKey");
    __decorate([
      JsonProp({ name: "k", converter: JsonBase64UrlConverter })
    ], HmacCryptoKey.prototype, "data", void 0);
    HmacProvider2 = class extends HmacProvider {
      async onGenerateKey(algorithm, extractable, keyUsages) {
        const length = (algorithm.length || this.getDefaultLength(algorithm.hash.name)) >> 3 << 3;
        const key = new HmacCryptoKey();
        key.algorithm = {
          ...algorithm,
          length,
          name: this.name
        };
        key.extractable = extractable;
        key.usages = keyUsages;
        key.data = import_crypto.default.randomBytes(length >> 3);
        return setCryptoKey(key);
      }
      async onSign(algorithm, key, data) {
        const cryptoAlg = ShaCrypto.getAlgorithmName(key.algorithm.hash);
        const hmac = import_crypto.default.createHmac(cryptoAlg, getCryptoKey(key).data).update(Buffer.from(data)).digest();
        return new Uint8Array(hmac).buffer;
      }
      async onVerify(algorithm, key, signature, data) {
        const cryptoAlg = ShaCrypto.getAlgorithmName(key.algorithm.hash);
        const hmac = import_crypto.default.createHmac(cryptoAlg, getCryptoKey(key).data).update(Buffer.from(data)).digest();
        return hmac.compare(Buffer.from(signature)) === 0;
      }
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        let key;
        switch (format.toLowerCase()) {
          case "jwk":
            key = JsonParser.fromJSON(keyData, { targetSchema: HmacCryptoKey });
            break;
          case "raw":
            key = new HmacCryptoKey();
            key.data = Buffer.from(keyData);
            break;
          default:
            throw new OperationError("format: Must be 'jwk' or 'raw'");
        }
        key.algorithm = {
          hash: { name: algorithm.hash.name },
          name: this.name,
          length: key.data.length << 3
        };
        key.extractable = extractable;
        key.usages = keyUsages;
        return setCryptoKey(key);
      }
      async onExportKey(format, key) {
        switch (format.toLowerCase()) {
          case "jwk":
            return JsonSerializer.toJSON(getCryptoKey(key));
          case "raw":
            return new Uint8Array(getCryptoKey(key).data).buffer;
          default:
            throw new OperationError("format: Must be 'jwk' or 'raw'");
        }
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof HmacCryptoKey)) {
          throw new TypeError("key: Is not HMAC CryptoKey");
        }
      }
    };
    __name(HmacProvider2, "HmacProvider");
    HkdfCryptoKey = class extends CryptoKey2 {
    };
    __name(HkdfCryptoKey, "HkdfCryptoKey");
    HkdfProvider2 = class extends HkdfProvider {
      async onImportKey(format, keyData, algorithm, extractable, keyUsages) {
        if (format.toLowerCase() !== "raw") {
          throw new OperationError("Operation not supported");
        }
        const key = new HkdfCryptoKey();
        key.data = Buffer.from(keyData);
        key.algorithm = { name: this.name };
        key.extractable = extractable;
        key.usages = keyUsages;
        return setCryptoKey(key);
      }
      async onDeriveBits(params, baseKey, length) {
        const hash = params.hash.name.replace("-", "");
        const hashLength = import_crypto.default.createHash(hash).digest().length;
        const byteLength = length / 8;
        const info = BufferSourceConverter.toUint8Array(params.info);
        const PRK = import_crypto.default.createHmac(hash, BufferSourceConverter.toUint8Array(params.salt)).update(BufferSourceConverter.toUint8Array(getCryptoKey(baseKey).data)).digest();
        const blocks = [Buffer.alloc(0)];
        const blockCount = Math.ceil(byteLength / hashLength) + 1;
        for (let i = 1; i < blockCount; ++i) {
          blocks.push(import_crypto.default.createHmac(hash, PRK).update(Buffer.concat([blocks[i - 1], info, Buffer.from([i])])).digest());
        }
        return Buffer.concat(blocks).slice(0, byteLength);
      }
      checkCryptoKey(key, keyUsage) {
        super.checkCryptoKey(key, keyUsage);
        if (!(getCryptoKey(key) instanceof HkdfCryptoKey)) {
          throw new TypeError("key: Is not HKDF CryptoKey");
        }
      }
    };
    __name(HkdfProvider2, "HkdfProvider");
    ShakeCrypto = class {
      static digest(algorithm, data) {
        const hash = import_crypto.default.createHash(algorithm.name.toLowerCase(), { outputLength: algorithm.length }).update(Buffer.from(data)).digest();
        return new Uint8Array(hash).buffer;
      }
    };
    __name(ShakeCrypto, "ShakeCrypto");
    Shake128Provider2 = class extends Shake128Provider {
      async onDigest(algorithm, data) {
        return ShakeCrypto.digest(algorithm, data);
      }
    };
    __name(Shake128Provider2, "Shake128Provider");
    Shake256Provider2 = class extends Shake256Provider {
      async onDigest(algorithm, data) {
        return ShakeCrypto.digest(algorithm, data);
      }
    };
    __name(Shake256Provider2, "Shake256Provider");
    SubtleCrypto2 = class extends SubtleCrypto {
      constructor() {
        var _a2;
        super();
        this.providers.set(new AesCbcProvider2());
        this.providers.set(new AesCtrProvider2());
        this.providers.set(new AesGcmProvider2());
        this.providers.set(new AesCmacProvider2());
        this.providers.set(new AesKwProvider2());
        this.providers.set(new AesEcbProvider2());
        this.providers.set(new DesCbcProvider());
        this.providers.set(new DesEde3CbcProvider());
        this.providers.set(new RsaSsaProvider2());
        this.providers.set(new RsaPssProvider2());
        this.providers.set(new RsaOaepProvider2());
        this.providers.set(new RsaEsProvider());
        this.providers.set(new EcdsaProvider2());
        this.providers.set(new EcdhProvider2());
        this.providers.set(new Sha1Provider());
        this.providers.set(new Sha256Provider());
        this.providers.set(new Sha384Provider());
        this.providers.set(new Sha512Provider());
        this.providers.set(new Pbkdf2Provider2());
        this.providers.set(new HmacProvider2());
        this.providers.set(new HkdfProvider2());
        const nodeMajorVersion = (_a2 = /^v(\d+)/.exec(process2.version)) === null || _a2 === void 0 ? void 0 : _a2[1];
        if (nodeMajorVersion && parseInt(nodeMajorVersion, 10) >= 12) {
          this.providers.set(new Shake128Provider2());
          this.providers.set(new Shake256Provider2());
        }
        const hashes = crypto.getHashes();
        if (hashes.includes("sha3-256")) {
          this.providers.set(new Sha3256Provider());
        }
        if (hashes.includes("sha3-384")) {
          this.providers.set(new Sha3384Provider());
        }
        if (hashes.includes("sha3-512")) {
          this.providers.set(new Sha3512Provider());
        }
        if (nodeMajorVersion && parseInt(nodeMajorVersion, 10) >= 14) {
          this.providers.set(new EdDsaProvider2());
          this.providers.set(new EcdhEsProvider2());
        }
      }
    };
    __name(SubtleCrypto2, "SubtleCrypto");
    Crypto2 = class extends Crypto {
      constructor() {
        super(...arguments);
        this.subtle = new SubtleCrypto2();
      }
      getRandomValues(array) {
        if (!ArrayBuffer.isView(array)) {
          throw new TypeError("Failed to execute 'getRandomValues' on 'Crypto': parameter 1 is not of type 'ArrayBufferView'");
        }
        const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
        import_crypto.default.randomFillSync(buffer);
        return array;
      }
    };
    __name(Crypto2, "Crypto");
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/rng.js
var require_rng = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/rng.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = rng;
    var _crypto = _interopRequireDefault(require("crypto"));
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    var rnds8Pool = new Uint8Array(256);
    var poolPtr = rnds8Pool.length;
    function rng() {
      if (poolPtr > rnds8Pool.length - 16) {
        _crypto.default.randomFillSync(rnds8Pool);
        poolPtr = 0;
      }
      return rnds8Pool.slice(poolPtr, poolPtr += 16);
    }
    __name(rng, "rng");
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/regex.js
var require_regex = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/regex.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/validate.js
var require_validate = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/validate.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _regex = _interopRequireDefault(require_regex());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function validate(uuid) {
      return typeof uuid === "string" && _regex.default.test(uuid);
    }
    __name(validate, "validate");
    var _default = validate;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/stringify.js
var require_stringify = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/stringify.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    var byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).substr(1));
    }
    function stringify(arr, offset = 0) {
      const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
      if (!(0, _validate.default)(uuid)) {
        throw TypeError("Stringified UUID is invalid");
      }
      return uuid;
    }
    __name(stringify, "stringify");
    var _default = stringify;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v1.js
var require_v1 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _rng = _interopRequireDefault(require_rng());
    var _stringify = _interopRequireDefault(require_stringify());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    var _nodeId;
    var _clockseq;
    var _lastMSecs = 0;
    var _lastNSecs = 0;
    function v1(options, buf, offset) {
      let i = buf && offset || 0;
      const b = buf || new Array(16);
      options = options || {};
      let node = options.node || _nodeId;
      let clockseq = options.clockseq !== void 0 ? options.clockseq : _clockseq;
      if (node == null || clockseq == null) {
        const seedBytes = options.random || (options.rng || _rng.default)();
        if (node == null) {
          node = _nodeId = [seedBytes[0] | 1, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
        }
        if (clockseq == null) {
          clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 16383;
        }
      }
      let msecs = options.msecs !== void 0 ? options.msecs : Date.now();
      let nsecs = options.nsecs !== void 0 ? options.nsecs : _lastNSecs + 1;
      const dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
      if (dt < 0 && options.clockseq === void 0) {
        clockseq = clockseq + 1 & 16383;
      }
      if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === void 0) {
        nsecs = 0;
      }
      if (nsecs >= 1e4) {
        throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
      }
      _lastMSecs = msecs;
      _lastNSecs = nsecs;
      _clockseq = clockseq;
      msecs += 122192928e5;
      const tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
      b[i++] = tl >>> 24 & 255;
      b[i++] = tl >>> 16 & 255;
      b[i++] = tl >>> 8 & 255;
      b[i++] = tl & 255;
      const tmh = msecs / 4294967296 * 1e4 & 268435455;
      b[i++] = tmh >>> 8 & 255;
      b[i++] = tmh & 255;
      b[i++] = tmh >>> 24 & 15 | 16;
      b[i++] = tmh >>> 16 & 255;
      b[i++] = clockseq >>> 8 | 128;
      b[i++] = clockseq & 255;
      for (let n = 0; n < 6; ++n) {
        b[i + n] = node[n];
      }
      return buf || (0, _stringify.default)(b);
    }
    __name(v1, "v1");
    var _default = v1;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/parse.js
var require_parse = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/parse.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function parse(uuid) {
      if (!(0, _validate.default)(uuid)) {
        throw TypeError("Invalid UUID");
      }
      let v;
      const arr = new Uint8Array(16);
      arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
      arr[1] = v >>> 16 & 255;
      arr[2] = v >>> 8 & 255;
      arr[3] = v & 255;
      arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
      arr[5] = v & 255;
      arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
      arr[7] = v & 255;
      arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
      arr[9] = v & 255;
      arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776 & 255;
      arr[11] = v / 4294967296 & 255;
      arr[12] = v >>> 24 & 255;
      arr[13] = v >>> 16 & 255;
      arr[14] = v >>> 8 & 255;
      arr[15] = v & 255;
      return arr;
    }
    __name(parse, "parse");
    var _default = parse;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v35.js
var require_v35 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v35.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = _default;
    exports.URL = exports.DNS = void 0;
    var _stringify = _interopRequireDefault(require_stringify());
    var _parse = _interopRequireDefault(require_parse());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function stringToBytes(str) {
      str = unescape(encodeURIComponent(str));
      const bytes = [];
      for (let i = 0; i < str.length; ++i) {
        bytes.push(str.charCodeAt(i));
      }
      return bytes;
    }
    __name(stringToBytes, "stringToBytes");
    var DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    exports.DNS = DNS;
    var URL2 = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    exports.URL = URL2;
    function _default(name, version2, hashfunc) {
      function generateUUID(value, namespace, buf, offset) {
        if (typeof value === "string") {
          value = stringToBytes(value);
        }
        if (typeof namespace === "string") {
          namespace = (0, _parse.default)(namespace);
        }
        if (namespace.length !== 16) {
          throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
        }
        let bytes = new Uint8Array(16 + value.length);
        bytes.set(namespace);
        bytes.set(value, namespace.length);
        bytes = hashfunc(bytes);
        bytes[6] = bytes[6] & 15 | version2;
        bytes[8] = bytes[8] & 63 | 128;
        if (buf) {
          offset = offset || 0;
          for (let i = 0; i < 16; ++i) {
            buf[offset + i] = bytes[i];
          }
          return buf;
        }
        return (0, _stringify.default)(bytes);
      }
      __name(generateUUID, "generateUUID");
      try {
        generateUUID.name = name;
      } catch (err) {
      }
      generateUUID.DNS = DNS;
      generateUUID.URL = URL2;
      return generateUUID;
    }
    __name(_default, "_default");
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/md5.js
var require_md5 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/md5.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _crypto = _interopRequireDefault(require("crypto"));
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function md5(bytes) {
      if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
      } else if (typeof bytes === "string") {
        bytes = Buffer.from(bytes, "utf8");
      }
      return _crypto.default.createHash("md5").update(bytes).digest();
    }
    __name(md5, "md5");
    var _default = md5;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v3.js
var require_v3 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v3.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _v = _interopRequireDefault(require_v35());
    var _md = _interopRequireDefault(require_md5());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    var v3 = (0, _v.default)("v3", 48, _md.default);
    var _default = v3;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v4.js
var require_v4 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v4.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _rng = _interopRequireDefault(require_rng());
    var _stringify = _interopRequireDefault(require_stringify());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function v4(options, buf, offset) {
      options = options || {};
      const rnds = options.random || (options.rng || _rng.default)();
      rnds[6] = rnds[6] & 15 | 64;
      rnds[8] = rnds[8] & 63 | 128;
      if (buf) {
        offset = offset || 0;
        for (let i = 0; i < 16; ++i) {
          buf[offset + i] = rnds[i];
        }
        return buf;
      }
      return (0, _stringify.default)(rnds);
    }
    __name(v4, "v4");
    var _default = v4;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/sha1.js
var require_sha1 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/sha1.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _crypto = _interopRequireDefault(require("crypto"));
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function sha1(bytes) {
      if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
      } else if (typeof bytes === "string") {
        bytes = Buffer.from(bytes, "utf8");
      }
      return _crypto.default.createHash("sha1").update(bytes).digest();
    }
    __name(sha1, "sha1");
    var _default = sha1;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v5.js
var require_v5 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v5.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _v = _interopRequireDefault(require_v35());
    var _sha = _interopRequireDefault(require_sha1());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    var v5 = (0, _v.default)("v5", 80, _sha.default);
    var _default = v5;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/nil.js
var require_nil = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/nil.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _default = "00000000-0000-0000-0000-000000000000";
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/version.js
var require_version = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function version2(uuid) {
      if (!(0, _validate.default)(uuid)) {
        throw TypeError("Invalid UUID");
      }
      return parseInt(uuid.substr(14, 1), 16);
    }
    __name(version2, "version");
    var _default = version2;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    Object.defineProperty(exports, "v1", {
      enumerable: true,
      get: function() {
        return _v.default;
      }
    });
    Object.defineProperty(exports, "v3", {
      enumerable: true,
      get: function() {
        return _v2.default;
      }
    });
    Object.defineProperty(exports, "v4", {
      enumerable: true,
      get: function() {
        return _v3.default;
      }
    });
    Object.defineProperty(exports, "v5", {
      enumerable: true,
      get: function() {
        return _v4.default;
      }
    });
    Object.defineProperty(exports, "NIL", {
      enumerable: true,
      get: function() {
        return _nil.default;
      }
    });
    Object.defineProperty(exports, "version", {
      enumerable: true,
      get: function() {
        return _version.default;
      }
    });
    Object.defineProperty(exports, "validate", {
      enumerable: true,
      get: function() {
        return _validate.default;
      }
    });
    Object.defineProperty(exports, "stringify", {
      enumerable: true,
      get: function() {
        return _stringify.default;
      }
    });
    Object.defineProperty(exports, "parse", {
      enumerable: true,
      get: function() {
        return _parse.default;
      }
    });
    var _v = _interopRequireDefault(require_v1());
    var _v2 = _interopRequireDefault(require_v3());
    var _v3 = _interopRequireDefault(require_v4());
    var _v4 = _interopRequireDefault(require_v5());
    var _nil = _interopRequireDefault(require_nil());
    var _version = _interopRequireDefault(require_version());
    var _validate = _interopRequireDefault(require_validate());
    var _stringify = _interopRequireDefault(require_stringify());
    var _parse = _interopRequireDefault(require_parse());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
  }
});

// src/polyfills/web-crypto.js
var require_web_crypto = __commonJS({
  "src/polyfills/web-crypto.js"(exports, module2) {
    "use strict";
    var { Crypto: WebCrypto, CryptoKey: CryptoKey3 } = (init_webcrypto_es(), __toCommonJS(webcrypto_es_exports));
    var { v4: uuid } = require_dist();
    var _randomUUID;
    var Crypto3 = class extends WebCrypto {
      constructor() {
        super(...arguments);
        __privateAdd(this, _randomUUID, uuid);
      }
    };
    __name(Crypto3, "Crypto");
    _randomUUID = new WeakMap();
    function SubtleCrypto3() {
      if (!(this instanceof SubtleCrypto3))
        return new SubtleCrypto3();
      throw TypeError("Illegal constructor");
    }
    __name(SubtleCrypto3, "SubtleCrypto");
    function SubtleCryptoToString() {
      return "function SubtleCrypto() { [native code] }";
    }
    __name(SubtleCryptoToString, "SubtleCryptoToString");
    Object.defineProperty(SubtleCryptoToString, "name", {
      configurable: true,
      enumerable: false,
      value: "toString() { [native code] }",
      writable: true
    });
    Object.defineProperty(SubtleCrypto3, "toString", {
      configurable: true,
      enumerable: false,
      value: SubtleCryptoToString,
      writable: true
    });
    module2.exports.Crypto = Crypto3;
    module2.exports.CryptoKey = CryptoKey3;
    module2.exports.SubtleCrypto = SubtleCrypto3;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/constants.js
var require_constants2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/constants.js"(exports, module2) {
    "use strict";
    var corsSafeListedMethods = ["GET", "HEAD", "POST"];
    var nullBodyStatus = [101, 204, 205, 304];
    var redirectStatus = [301, 302, 303, 307, 308];
    var referrerPolicy = [
      "",
      "no-referrer",
      "no-referrer-when-downgrade",
      "same-origin",
      "origin",
      "strict-origin",
      "origin-when-cross-origin",
      "strict-origin-when-cross-origin",
      "unsafe-url"
    ];
    var requestRedirect = ["follow", "manual", "error"];
    var safeMethods = ["GET", "HEAD", "OPTIONS", "TRACE"];
    var requestMode = ["navigate", "same-origin", "no-cors", "cors"];
    var requestCredentials = ["omit", "same-origin", "include"];
    var requestCache = [
      "default",
      "no-store",
      "reload",
      "no-cache",
      "force-cache",
      "only-if-cached"
    ];
    var requestBodyHeader = [
      "content-encoding",
      "content-language",
      "content-location",
      "content-type"
    ];
    var forbiddenMethods = ["CONNECT", "TRACE", "TRACK"];
    var subresource = [
      "audio",
      "audioworklet",
      "font",
      "image",
      "manifest",
      "paintworklet",
      "script",
      "style",
      "track",
      "video",
      "xslt",
      ""
    ];
    module2.exports = {
      subresource,
      forbiddenMethods,
      requestBodyHeader,
      referrerPolicy,
      requestRedirect,
      requestMode,
      requestCredentials,
      requestCache,
      redirectStatus,
      corsSafeListedMethods,
      nullBodyStatus,
      safeMethods
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/symbols.js
var require_symbols = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/symbols.js"(exports, module2) {
    module2.exports = {
      kClose: Symbol("close"),
      kDestroy: Symbol("destroy"),
      kDispatch: Symbol("dispatch"),
      kUrl: Symbol("url"),
      kWriting: Symbol("writing"),
      kResuming: Symbol("resuming"),
      kQueue: Symbol("queue"),
      kConnect: Symbol("connect"),
      kConnecting: Symbol("connecting"),
      kHeadersList: Symbol("headers list"),
      kKeepAliveDefaultTimeout: Symbol("default keep alive timeout"),
      kKeepAliveMaxTimeout: Symbol("max keep alive timeout"),
      kKeepAliveTimeoutThreshold: Symbol("keep alive timeout threshold"),
      kKeepAliveTimeoutValue: Symbol("keep alive timeout"),
      kKeepAlive: Symbol("keep alive"),
      kHeadersTimeout: Symbol("headers timeout"),
      kBodyTimeout: Symbol("body timeout"),
      kServerName: Symbol("server name"),
      kHost: Symbol("host"),
      kNoRef: Symbol("no ref"),
      kBodyUsed: Symbol("used"),
      kRunning: Symbol("running"),
      kBlocking: Symbol("blocking"),
      kPending: Symbol("pending"),
      kSize: Symbol("size"),
      kBusy: Symbol("busy"),
      kQueued: Symbol("queued"),
      kFree: Symbol("free"),
      kConnected: Symbol("connected"),
      kClosed: Symbol("closed"),
      kNeedDrain: Symbol("need drain"),
      kReset: Symbol("reset"),
      kDestroyed: Symbol("destroyed"),
      kMaxHeadersSize: Symbol("max headers size"),
      kRunningIdx: Symbol("running index"),
      kPendingIdx: Symbol("pending index"),
      kError: Symbol("error"),
      kClients: Symbol("clients"),
      kClient: Symbol("client"),
      kParser: Symbol("parser"),
      kOnDestroyed: Symbol("destroy callbacks"),
      kPipelining: Symbol("pipelinig"),
      kSocket: Symbol("socket"),
      kHostHeader: Symbol("host header"),
      kConnector: Symbol("connector"),
      kStrictContentLength: Symbol("strict content length"),
      kMaxRedirections: Symbol("maxRedirections"),
      kMaxRequests: Symbol("maxRequestsPerClient"),
      kProxy: Symbol("proxy agent options"),
      kCounter: Symbol("socket request counter")
    };
  }
});

// src/polyfills/http.js
var require_http = __commonJS({
  "src/polyfills/http.js"(exports, module2) {
    var http = require_http();
    http.validateHeaderName = /* @__PURE__ */ __name(function validateHeaderName(name) {
      if (typeof name !== "string" || !name) {
        const message = `Header name must be a valid HTTP token ["${name}"]`;
        const error = new TypeError(message);
        error.code = "ERR_INVALID_HTTP_TOKEN";
        throw error;
      }
    }, "validateHeaderName");
    http.validateHeaderValue = /* @__PURE__ */ __name(function validateHeaderValue(value) {
      if (value === void 0) {
        const message = `Invalid value "${value}" for header "${value}"`;
        const error = new TypeError(message);
        error.code = "ERR_HTTP_INVALID_HEADER_VALUE";
        throw error;
      }
    }, "validateHeaderValue");
    module2.exports = http;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/symbols.js
var require_symbols2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/symbols.js"(exports, module2) {
    "use strict";
    module2.exports = {
      kUrl: Symbol("url"),
      kHeaders: Symbol("headers"),
      kSignal: Symbol("signal"),
      kState: Symbol("state"),
      kGuard: Symbol("guard"),
      kRealm: Symbol("realm")
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/errors.js
var require_errors = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/errors.js"(exports, module2) {
    "use strict";
    var AbortError = class extends Error {
      constructor() {
        super("The operation was aborted");
        this.code = "ABORT_ERR";
        this.name = "AbortError";
      }
    };
    __name(AbortError, "AbortError");
    var UndiciError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "UndiciError";
        this.code = "UND_ERR";
      }
    };
    __name(UndiciError, "UndiciError");
    var ConnectTimeoutError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ConnectTimeoutError);
        this.name = "ConnectTimeoutError";
        this.message = message || "Connect Timeout Error";
        this.code = "UND_ERR_CONNECT_TIMEOUT";
      }
    };
    __name(ConnectTimeoutError, "ConnectTimeoutError");
    var HeadersTimeoutError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, HeadersTimeoutError);
        this.name = "HeadersTimeoutError";
        this.message = message || "Headers Timeout Error";
        this.code = "UND_ERR_HEADERS_TIMEOUT";
      }
    };
    __name(HeadersTimeoutError, "HeadersTimeoutError");
    var HeadersOverflowError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, HeadersOverflowError);
        this.name = "HeadersOverflowError";
        this.message = message || "Headers Overflow Error";
        this.code = "UND_ERR_HEADERS_OVERFLOW";
      }
    };
    __name(HeadersOverflowError, "HeadersOverflowError");
    var BodyTimeoutError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, BodyTimeoutError);
        this.name = "BodyTimeoutError";
        this.message = message || "Body Timeout Error";
        this.code = "UND_ERR_BODY_TIMEOUT";
      }
    };
    __name(BodyTimeoutError, "BodyTimeoutError");
    var ResponseStatusCodeError = class extends UndiciError {
      constructor(message, statusCode, headers) {
        super(message);
        Error.captureStackTrace(this, ResponseStatusCodeError);
        this.name = "ResponseStatusCodeError";
        this.message = message || "Response Status Code Error";
        this.code = "UND_ERR_RESPONSE_STATUS_CODE";
        this.status = statusCode;
        this.statusCode = statusCode;
        this.headers = headers;
      }
    };
    __name(ResponseStatusCodeError, "ResponseStatusCodeError");
    var InvalidArgumentError2 = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, InvalidArgumentError2);
        this.name = "InvalidArgumentError";
        this.message = message || "Invalid Argument Error";
        this.code = "UND_ERR_INVALID_ARG";
      }
    };
    __name(InvalidArgumentError2, "InvalidArgumentError");
    var InvalidReturnValueError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, InvalidReturnValueError);
        this.name = "InvalidReturnValueError";
        this.message = message || "Invalid Return Value Error";
        this.code = "UND_ERR_INVALID_RETURN_VALUE";
      }
    };
    __name(InvalidReturnValueError, "InvalidReturnValueError");
    var RequestAbortedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, RequestAbortedError);
        this.name = "AbortError";
        this.message = message || "Request aborted";
        this.code = "UND_ERR_ABORTED";
      }
    };
    __name(RequestAbortedError, "RequestAbortedError");
    var InformationalError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, InformationalError);
        this.name = "InformationalError";
        this.message = message || "Request information";
        this.code = "UND_ERR_INFO";
      }
    };
    __name(InformationalError, "InformationalError");
    var RequestContentLengthMismatchError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, RequestContentLengthMismatchError);
        this.name = "RequestContentLengthMismatchError";
        this.message = message || "Request body length does not match content-length header";
        this.code = "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH";
      }
    };
    __name(RequestContentLengthMismatchError, "RequestContentLengthMismatchError");
    var ResponseContentLengthMismatchError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ResponseContentLengthMismatchError);
        this.name = "ResponseContentLengthMismatchError";
        this.message = message || "Response body length does not match content-length header";
        this.code = "UND_ERR_RES_CONTENT_LENGTH_MISMATCH";
      }
    };
    __name(ResponseContentLengthMismatchError, "ResponseContentLengthMismatchError");
    var ClientDestroyedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ClientDestroyedError);
        this.name = "ClientDestroyedError";
        this.message = message || "The client is destroyed";
        this.code = "UND_ERR_DESTROYED";
      }
    };
    __name(ClientDestroyedError, "ClientDestroyedError");
    var ClientClosedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ClientClosedError);
        this.name = "ClientClosedError";
        this.message = message || "The client is closed";
        this.code = "UND_ERR_CLOSED";
      }
    };
    __name(ClientClosedError, "ClientClosedError");
    var SocketError = class extends UndiciError {
      constructor(message, socket) {
        super(message);
        Error.captureStackTrace(this, SocketError);
        this.name = "SocketError";
        this.message = message || "Socket error";
        this.code = "UND_ERR_SOCKET";
        this.socket = socket;
      }
    };
    __name(SocketError, "SocketError");
    var NotSupportedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, NotSupportedError);
        this.name = "NotSupportedError";
        this.message = message || "Not supported error";
        this.code = "UND_ERR_NOT_SUPPORTED";
      }
    };
    __name(NotSupportedError, "NotSupportedError");
    var BalancedPoolMissingUpstreamError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, NotSupportedError);
        this.name = "MissingUpstreamError";
        this.message = message || "No upstream has been added to the BalancedPool";
        this.code = "UND_ERR_BPL_MISSING_UPSTREAM";
      }
    };
    __name(BalancedPoolMissingUpstreamError, "BalancedPoolMissingUpstreamError");
    var HTTPParserError = class extends Error {
      constructor(message, code, data) {
        super(message);
        Error.captureStackTrace(this, HTTPParserError);
        this.name = "HTTPParserError";
        this.code = code ? `HPE_${code}` : void 0;
        this.data = data ? data.toString() : void 0;
      }
    };
    __name(HTTPParserError, "HTTPParserError");
    module2.exports = {
      AbortError,
      HTTPParserError,
      UndiciError,
      HeadersTimeoutError,
      HeadersOverflowError,
      BodyTimeoutError,
      RequestContentLengthMismatchError,
      ConnectTimeoutError,
      ResponseStatusCodeError,
      InvalidArgumentError: InvalidArgumentError2,
      InvalidReturnValueError,
      RequestAbortedError,
      ClientDestroyedError,
      ClientClosedError,
      InformationalError,
      SocketError,
      NotSupportedError,
      ResponseContentLengthMismatchError,
      BalancedPoolMissingUpstreamError
    };
  }
});

// src/polyfills/web-streams.js
var require_web_streams = __commonJS({
  "src/polyfills/web-streams.js"(exports, module2) {
    "use strict";
    var streams = require_ponyfill();
    var {
      ReadableStream,
      ReadableStreamBYOBReader,
      ReadableStreamDefaultReader,
      TransformStream,
      WritableStream,
      WritableStreamDefaultWriter
    } = streams;
    module2.exports = {
      ReadableStream,
      ReadableStreamBYOBReader,
      ReadableStreamDefaultReader,
      TransformStream,
      WritableStream,
      WritableStreamDefaultWriter
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/util.js
var require_util = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/util.js"(exports, module2) {
    "use strict";
    var assert = require("assert");
    var { kDestroyed, kBodyUsed } = require_symbols();
    var { IncomingMessage } = require_http();
    var stream = require("stream");
    var net = require("net");
    var { InvalidArgumentError: InvalidArgumentError2 } = require_errors();
    var { Blob } = require_buffer();
    var nodeUtil = require("util");
    function nop() {
    }
    __name(nop, "nop");
    function isStream(obj) {
      return obj && typeof obj.pipe === "function";
    }
    __name(isStream, "isStream");
    function isBlobLike(object) {
      return Blob && object instanceof Blob || object && typeof object === "object" && (typeof object.stream === "function" || typeof object.arrayBuffer === "function") && /^(Blob|File)$/.test(object[Symbol.toStringTag]);
    }
    __name(isBlobLike, "isBlobLike");
    function isObject(val) {
      return val !== null && typeof val === "object";
    }
    __name(isObject, "isObject");
    function encode(val) {
      return encodeURIComponent(val);
    }
    __name(encode, "encode");
    function buildURL(url, queryParams) {
      if (url.includes("?") || url.includes("#")) {
        throw new Error('Query params cannot be passed when url already contains "?" or "#".');
      }
      if (!isObject(queryParams)) {
        throw new Error("Query params must be an object");
      }
      const parts = [];
      for (let [key, val] of Object.entries(queryParams)) {
        if (val === null || typeof val === "undefined") {
          continue;
        }
        if (!Array.isArray(val)) {
          val = [val];
        }
        for (const v of val) {
          if (isObject(v)) {
            throw new Error("Passing object as a query param is not supported, please serialize to string up-front");
          }
          parts.push(encode(key) + "=" + encode(v));
        }
      }
      const serializedParams = parts.join("&");
      if (serializedParams) {
        url += "?" + serializedParams;
      }
      return url;
    }
    __name(buildURL, "buildURL");
    function parseURL(url) {
      if (typeof url === "string") {
        url = new URL(url);
      }
      if (!url || typeof url !== "object") {
        throw new InvalidArgumentError2("invalid url");
      }
      if (url.port != null && url.port !== "" && !Number.isFinite(parseInt(url.port))) {
        throw new InvalidArgumentError2("invalid port");
      }
      if (url.path != null && typeof url.path !== "string") {
        throw new InvalidArgumentError2("invalid path");
      }
      if (url.pathname != null && typeof url.pathname !== "string") {
        throw new InvalidArgumentError2("invalid pathname");
      }
      if (url.hostname != null && typeof url.hostname !== "string") {
        throw new InvalidArgumentError2("invalid hostname");
      }
      if (url.origin != null && typeof url.origin !== "string") {
        throw new InvalidArgumentError2("invalid origin");
      }
      if (!/^https?:/.test(url.origin || url.protocol)) {
        throw new InvalidArgumentError2("invalid protocol");
      }
      if (!(url instanceof URL)) {
        const port = url.port != null ? url.port : url.protocol === "https:" ? 443 : 80;
        const origin = url.origin != null ? url.origin : `${url.protocol}//${url.hostname}:${port}`;
        const path = url.path != null ? url.path : `${url.pathname || ""}${url.search || ""}`;
        url = new URL(path, origin);
      }
      return url;
    }
    __name(parseURL, "parseURL");
    function parseOrigin(url) {
      url = parseURL(url);
      if (url.pathname !== "/" || url.search || url.hash) {
        throw new InvalidArgumentError2("invalid url");
      }
      return url;
    }
    __name(parseOrigin, "parseOrigin");
    function getHostname(host) {
      if (host[0] === "[") {
        const idx2 = host.indexOf("]");
        assert(idx2 !== -1);
        return host.substr(1, idx2 - 1);
      }
      const idx = host.indexOf(":");
      if (idx === -1)
        return host;
      return host.substr(0, idx);
    }
    __name(getHostname, "getHostname");
    function getServerName(host) {
      if (!host) {
        return null;
      }
      assert.strictEqual(typeof host, "string");
      const servername = getHostname(host);
      if (net.isIP(servername)) {
        return "";
      }
      return servername;
    }
    __name(getServerName, "getServerName");
    function deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
    __name(deepClone, "deepClone");
    function isAsyncIterable(obj) {
      return !!(obj != null && typeof obj[Symbol.asyncIterator] === "function");
    }
    __name(isAsyncIterable, "isAsyncIterable");
    function isIterable(obj) {
      return !!(obj != null && (typeof obj[Symbol.iterator] === "function" || typeof obj[Symbol.asyncIterator] === "function"));
    }
    __name(isIterable, "isIterable");
    function bodyLength(body) {
      if (body == null) {
        return 0;
      } else if (isStream(body)) {
        const state = body._readableState;
        return state && state.ended === true && Number.isFinite(state.length) ? state.length : null;
      } else if (isBlobLike(body)) {
        return body.size != null ? body.size : null;
      } else if (isBuffer(body)) {
        return body.byteLength;
      }
      return null;
    }
    __name(bodyLength, "bodyLength");
    function isDestroyed(stream2) {
      return !stream2 || !!(stream2.destroyed || stream2[kDestroyed]);
    }
    __name(isDestroyed, "isDestroyed");
    function isReadableAborted(stream2) {
      const state = stream2 && stream2._readableState;
      return isDestroyed(stream2) && state && !state.endEmitted;
    }
    __name(isReadableAborted, "isReadableAborted");
    function destroy(stream2, err) {
      if (!isStream(stream2) || isDestroyed(stream2)) {
        return;
      }
      if (typeof stream2.destroy === "function") {
        if (Object.getPrototypeOf(stream2).constructor === IncomingMessage) {
          stream2.socket = null;
        }
        stream2.destroy(err);
      } else if (err) {
        process.nextTick((stream3, err2) => {
          stream3.emit("error", err2);
        }, stream2, err);
      }
      if (stream2.destroyed !== true) {
        stream2[kDestroyed] = true;
      }
    }
    __name(destroy, "destroy");
    var KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/;
    function parseKeepAliveTimeout(val) {
      const m = val.toString().match(KEEPALIVE_TIMEOUT_EXPR);
      return m ? parseInt(m[1], 10) * 1e3 : null;
    }
    __name(parseKeepAliveTimeout, "parseKeepAliveTimeout");
    function parseHeaders(headers, obj = {}) {
      for (let i = 0; i < headers.length; i += 2) {
        const key = headers[i].toString().toLowerCase();
        let val = obj[key];
        if (!val) {
          obj[key] = headers[i + 1].toString();
        } else {
          if (!Array.isArray(val)) {
            val = [val];
            obj[key] = val;
          }
          val.push(headers[i + 1].toString());
        }
      }
      return obj;
    }
    __name(parseHeaders, "parseHeaders");
    function parseRawHeaders(headers) {
      return headers.map((header) => header.toString());
    }
    __name(parseRawHeaders, "parseRawHeaders");
    function isBuffer(buffer) {
      return buffer instanceof Uint8Array || Buffer.isBuffer(buffer);
    }
    __name(isBuffer, "isBuffer");
    function validateHandler(handler, method, upgrade) {
      if (!handler || typeof handler !== "object") {
        throw new InvalidArgumentError2("handler must be an object");
      }
      if (typeof handler.onConnect !== "function") {
        throw new InvalidArgumentError2("invalid onConnect method");
      }
      if (typeof handler.onError !== "function") {
        throw new InvalidArgumentError2("invalid onError method");
      }
      if (typeof handler.onBodySent !== "function" && handler.onBodySent !== void 0) {
        throw new InvalidArgumentError2("invalid onBodySent method");
      }
      if (upgrade || method === "CONNECT") {
        if (typeof handler.onUpgrade !== "function") {
          throw new InvalidArgumentError2("invalid onUpgrade method");
        }
      } else {
        if (typeof handler.onHeaders !== "function") {
          throw new InvalidArgumentError2("invalid onHeaders method");
        }
        if (typeof handler.onData !== "function") {
          throw new InvalidArgumentError2("invalid onData method");
        }
        if (typeof handler.onComplete !== "function") {
          throw new InvalidArgumentError2("invalid onComplete method");
        }
      }
    }
    __name(validateHandler, "validateHandler");
    function isDisturbed(body) {
      return !!(body && (stream.isDisturbed ? stream.isDisturbed(body) || body[kBodyUsed] : body[kBodyUsed] || body.readableDidRead || body._readableState && body._readableState.dataEmitted || isReadableAborted(body)));
    }
    __name(isDisturbed, "isDisturbed");
    function isErrored(body) {
      return !!(body && (stream.isErrored ? stream.isErrored(body) : /state: 'errored'/.test(nodeUtil.inspect(body))));
    }
    __name(isErrored, "isErrored");
    function isReadable(body) {
      return !!(body && (stream.isReadable ? stream.isReadable(body) : /state: 'readable'/.test(nodeUtil.inspect(body))));
    }
    __name(isReadable, "isReadable");
    function getSocketInfo(socket) {
      return {
        localAddress: socket.localAddress,
        localPort: socket.localPort,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        remoteFamily: socket.remoteFamily,
        timeout: socket.timeout,
        bytesWritten: socket.bytesWritten,
        bytesRead: socket.bytesRead
      };
    }
    __name(getSocketInfo, "getSocketInfo");
    var ReadableStream;
    function ReadableStreamFrom(iterable) {
      if (!ReadableStream) {
        ReadableStream = require_web_streams().ReadableStream;
      }
      if (ReadableStream.from) {
        return ReadableStream.from(iterable);
      }
      let iterator;
      return new ReadableStream({
        async start() {
          iterator = iterable[Symbol.asyncIterator]();
        },
        async pull(controller) {
          const { done, value } = await iterator.next();
          if (done) {
            queueMicrotask(() => {
              controller.close();
            });
          } else {
            const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
            controller.enqueue(new Uint8Array(buf));
          }
          return controller.desiredSize > 0;
        },
        async cancel(reason) {
          await iterator.return();
        }
      }, 0);
    }
    __name(ReadableStreamFrom, "ReadableStreamFrom");
    function isFormDataLike(chunk) {
      return chunk && chunk.constructor && chunk.constructor.name === "FormData";
    }
    __name(isFormDataLike, "isFormDataLike");
    var kEnumerableProperty = /* @__PURE__ */ Object.create(null);
    kEnumerableProperty.enumerable = true;
    module2.exports = {
      kEnumerableProperty,
      nop,
      isDisturbed,
      isErrored,
      isReadable,
      toUSVString: nodeUtil.toUSVString || ((val) => `${val}`),
      isReadableAborted,
      isBlobLike,
      parseOrigin,
      parseURL,
      getServerName,
      isStream,
      isIterable,
      isAsyncIterable,
      isDestroyed,
      parseRawHeaders,
      parseHeaders,
      parseKeepAliveTimeout,
      destroy,
      bodyLength,
      deepClone,
      ReadableStreamFrom,
      isBuffer,
      validateHandler,
      getSocketInfo,
      isFormDataLike,
      buildURL
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/file.js
var require_file = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/file.js"(exports, module2) {
    "use strict";
    var { Blob } = require_buffer();
    var { kState } = require_symbols2();
    var File = class extends Blob {
      constructor(fileBits, fileName, options = {}) {
        var _a3;
        const n = fileName;
        const t = options.type;
        const d = (_a3 = options.lastModified) != null ? _a3 : Date.now();
        super(fileBits, { type: t });
        this[kState] = {
          name: n,
          lastModified: d
        };
      }
      get name() {
        if (!(this instanceof File)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].name;
      }
      get lastModified() {
        if (!(this instanceof File)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].lastModified;
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
    };
    __name(File, "File");
    var FileLike = class {
      constructor(blobLike, fileName, options = {}) {
        var _a3;
        const n = fileName;
        const t = options.type;
        const d = (_a3 = options.lastModified) != null ? _a3 : Date.now();
        this[kState] = {
          blobLike,
          name: n,
          type: t,
          lastModified: d
        };
      }
      stream(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.stream(...args);
      }
      arrayBuffer(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.arrayBuffer(...args);
      }
      slice(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.slice(...args);
      }
      text(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.text(...args);
      }
      get size() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.size;
      }
      get type() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.type;
      }
      get name() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].name;
      }
      get lastModified() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].lastModified;
      }
      get [Symbol.toStringTag]() {
        return "File";
      }
    };
    __name(FileLike, "FileLike");
    var _a2;
    module2.exports = { File: (_a2 = globalThis.File) != null ? _a2 : File, FileLike };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/util.js
var require_util2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/util.js"(exports, module2) {
    "use strict";
    var { redirectStatus } = require_constants2();
    var { performance } = require("perf_hooks");
    var { isBlobLike, toUSVString, ReadableStreamFrom } = require_util();
    var assert = require("assert");
    var File;
    var badPorts = [
      "1",
      "7",
      "9",
      "11",
      "13",
      "15",
      "17",
      "19",
      "20",
      "21",
      "22",
      "23",
      "25",
      "37",
      "42",
      "43",
      "53",
      "69",
      "77",
      "79",
      "87",
      "95",
      "101",
      "102",
      "103",
      "104",
      "109",
      "110",
      "111",
      "113",
      "115",
      "117",
      "119",
      "123",
      "135",
      "137",
      "139",
      "143",
      "161",
      "179",
      "389",
      "427",
      "465",
      "512",
      "513",
      "514",
      "515",
      "526",
      "530",
      "531",
      "532",
      "540",
      "548",
      "554",
      "556",
      "563",
      "587",
      "601",
      "636",
      "989",
      "990",
      "993",
      "995",
      "1719",
      "1720",
      "1723",
      "2049",
      "3659",
      "4045",
      "5060",
      "5061",
      "6000",
      "6566",
      "6665",
      "6666",
      "6667",
      "6668",
      "6669",
      "6697",
      "10080"
    ];
    function responseURL(response) {
      const urlList = response.urlList;
      const length = urlList.length;
      return length === 0 ? null : urlList[length - 1].toString();
    }
    __name(responseURL, "responseURL");
    function responseLocationURL(response, requestFragment) {
      if (!redirectStatus.includes(response.status)) {
        return null;
      }
      let location = response.headersList.get("location");
      location = location ? new URL(location, responseURL(response)) : null;
      if (location && !location.hash) {
        location.hash = requestFragment;
      }
      return location;
    }
    __name(responseLocationURL, "responseLocationURL");
    function requestCurrentURL(request) {
      return request.urlList[request.urlList.length - 1];
    }
    __name(requestCurrentURL, "requestCurrentURL");
    function requestBadPort(request) {
      const url = requestCurrentURL(request);
      if (/^https?:/.test(url.protocol) && badPorts.includes(url.port)) {
        return "blocked";
      }
      return "allowed";
    }
    __name(requestBadPort, "requestBadPort");
    function isFileLike(object) {
      if (!File) {
        File = require_file().File;
      }
      return object instanceof File || object && (typeof object.stream === "function" || typeof object.arrayBuffer === "function") && /^(File)$/.test(object[Symbol.toStringTag]);
    }
    __name(isFileLike, "isFileLike");
    function isValidReasonPhrase(statusText) {
      for (let i = 0; i < statusText.length; ++i) {
        const c = statusText.charCodeAt(i);
        if (!(c === 9 || c >= 32 && c <= 126 || c >= 128 && c <= 255)) {
          return false;
        }
      }
      return true;
    }
    __name(isValidReasonPhrase, "isValidReasonPhrase");
    function isTokenChar(c) {
      return !(c >= 127 || c <= 32 || c === "(" || c === ")" || c === "<" || c === ">" || c === "@" || c === "," || c === ";" || c === ":" || c === "\\" || c === '"' || c === "/" || c === "[" || c === "]" || c === "?" || c === "=" || c === "{" || c === "}");
    }
    __name(isTokenChar, "isTokenChar");
    function isValidHTTPToken(characters) {
      if (!characters || typeof characters !== "string") {
        return false;
      }
      for (let i = 0; i < characters.length; ++i) {
        const c = characters.charCodeAt(i);
        if (c > 127 || !isTokenChar(c)) {
          return false;
        }
      }
      return true;
    }
    __name(isValidHTTPToken, "isValidHTTPToken");
    function setRequestReferrerPolicyOnRedirect(request, actualResponse) {
      const policy = "";
      if (policy !== "") {
        request.referrerPolicy = policy;
      }
    }
    __name(setRequestReferrerPolicyOnRedirect, "setRequestReferrerPolicyOnRedirect");
    function crossOriginResourcePolicyCheck() {
      return "allowed";
    }
    __name(crossOriginResourcePolicyCheck, "crossOriginResourcePolicyCheck");
    function corsCheck() {
      return "success";
    }
    __name(corsCheck, "corsCheck");
    function TAOCheck() {
      return "success";
    }
    __name(TAOCheck, "TAOCheck");
    function appendFetchMetadata(httpRequest) {
      let header = null;
      header = httpRequest.mode;
      httpRequest.headersList.set("sec-fetch-mode", header);
    }
    __name(appendFetchMetadata, "appendFetchMetadata");
    function appendRequestOriginHeader(request) {
      let serializedOrigin = request.origin;
      if (request.responseTainting === "cors" || request.mode === "websocket") {
        if (serializedOrigin) {
          request.headersList.append("Origin", serializedOrigin);
        }
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        switch (request.referrerPolicy) {
          case "no-referrer":
            serializedOrigin = null;
            break;
          case "no-referrer-when-downgrade":
          case "strict-origin":
          case "strict-origin-when-cross-origin":
            if (/^https:/.test(request.origin) && !/^https:/.test(requestCurrentURL(request))) {
              serializedOrigin = null;
            }
            break;
          case "same-origin":
            if (!sameOrigin(request, requestCurrentURL(request))) {
              serializedOrigin = null;
            }
            break;
          default:
        }
        if (serializedOrigin) {
          request.headersList.append("Origin", serializedOrigin);
        }
      }
    }
    __name(appendRequestOriginHeader, "appendRequestOriginHeader");
    function coarsenedSharedCurrentTime(crossOriginIsolatedCapability) {
      return performance.now();
    }
    __name(coarsenedSharedCurrentTime, "coarsenedSharedCurrentTime");
    function createOpaqueTimingInfo(timingInfo) {
      var _a2, _b;
      return {
        startTime: (_a2 = timingInfo.startTime) != null ? _a2 : 0,
        redirectStartTime: 0,
        redirectEndTime: 0,
        postRedirectStartTime: (_b = timingInfo.startTime) != null ? _b : 0,
        finalServiceWorkerStartTime: 0,
        finalNetworkResponseStartTime: 0,
        finalNetworkRequestStartTime: 0,
        endTime: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
        finalConnectionTimingInfo: null
      };
    }
    __name(createOpaqueTimingInfo, "createOpaqueTimingInfo");
    function makePolicyContainer() {
      return {};
    }
    __name(makePolicyContainer, "makePolicyContainer");
    function clonePolicyContainer() {
      return {};
    }
    __name(clonePolicyContainer, "clonePolicyContainer");
    function determineRequestsReferrer(request) {
      return "no-referrer";
    }
    __name(determineRequestsReferrer, "determineRequestsReferrer");
    function matchRequestIntegrity(request, bytes) {
      return false;
    }
    __name(matchRequestIntegrity, "matchRequestIntegrity");
    function tryUpgradeRequestToAPotentiallyTrustworthyURL(request) {
    }
    __name(tryUpgradeRequestToAPotentiallyTrustworthyURL, "tryUpgradeRequestToAPotentiallyTrustworthyURL");
    function sameOrigin(A, B) {
      if (A.protocol === B.protocol && A.hostname === B.hostname && A.port === B.port) {
        return true;
      }
      return false;
    }
    __name(sameOrigin, "sameOrigin");
    function createDeferredPromise() {
      let res;
      let rej;
      const promise = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
      });
      return { promise, resolve: res, reject: rej };
    }
    __name(createDeferredPromise, "createDeferredPromise");
    function isAborted(fetchParams) {
      return fetchParams.controller.state === "aborted";
    }
    __name(isAborted, "isAborted");
    function isCancelled(fetchParams) {
      return fetchParams.controller.state === "aborted" || fetchParams.controller.state === "terminated";
    }
    __name(isCancelled, "isCancelled");
    function normalizeMethod(method) {
      return /^(DELETE|GET|HEAD|OPTIONS|POST|PUT)$/i.test(method) ? method.toUpperCase() : method;
    }
    __name(normalizeMethod, "normalizeMethod");
    function serializeJavascriptValueToJSONString(value) {
      const result = JSON.stringify(value);
      if (result === void 0) {
        throw new TypeError("Value is not JSON serializable");
      }
      assert(typeof result === "string");
      return result;
    }
    __name(serializeJavascriptValueToJSONString, "serializeJavascriptValueToJSONString");
    var esIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
    function makeIterator(iterator, name) {
      const i = {
        next() {
          if (Object.getPrototypeOf(this) !== i) {
            throw new TypeError(`'next' called on an object that does not implement interface ${name} Iterator.`);
          }
          return iterator.next();
        },
        [Symbol.toStringTag]: `${name} Iterator`
      };
      Object.setPrototypeOf(i, esIteratorPrototype);
      return Object.setPrototypeOf({}, i);
    }
    __name(makeIterator, "makeIterator");
    module2.exports = {
      isAborted,
      isCancelled,
      createDeferredPromise,
      ReadableStreamFrom,
      toUSVString,
      tryUpgradeRequestToAPotentiallyTrustworthyURL,
      coarsenedSharedCurrentTime,
      matchRequestIntegrity,
      determineRequestsReferrer,
      makePolicyContainer,
      clonePolicyContainer,
      appendFetchMetadata,
      appendRequestOriginHeader,
      TAOCheck,
      corsCheck,
      crossOriginResourcePolicyCheck,
      createOpaqueTimingInfo,
      setRequestReferrerPolicyOnRedirect,
      isValidHTTPToken,
      requestBadPort,
      requestCurrentURL,
      responseURL,
      responseLocationURL,
      isBlobLike,
      isFileLike,
      isValidReasonPhrase,
      sameOrigin,
      normalizeMethod,
      serializeJavascriptValueToJSONString,
      makeIterator
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/headers.js
var require_headers = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/headers.js"(exports, module2) {
    "use strict";
    var { validateHeaderName, validateHeaderValue } = require_http();
    var { kHeadersList } = require_symbols();
    var { kGuard } = require_symbols2();
    var { kEnumerableProperty } = require_util();
    var { makeIterator } = require_util2();
    var kHeadersMap = Symbol("headers map");
    var kHeadersSortedMap = Symbol("headers map sorted");
    function normalizeAndValidateHeaderName(name) {
      if (name === void 0) {
        throw new TypeError(`Header name ${name}`);
      }
      const normalizedHeaderName = name.toLocaleLowerCase();
      validateHeaderName(normalizedHeaderName);
      return normalizedHeaderName;
    }
    __name(normalizeAndValidateHeaderName, "normalizeAndValidateHeaderName");
    function normalizeAndValidateHeaderValue(name, value) {
      if (value === void 0) {
        throw new TypeError(value, name);
      }
      const normalizedHeaderValue = `${value}`.replace(/^[\n\t\r\x20]+|[\n\t\r\x20]+$/g, "");
      validateHeaderValue(name, normalizedHeaderValue);
      return normalizedHeaderValue;
    }
    __name(normalizeAndValidateHeaderValue, "normalizeAndValidateHeaderValue");
    function fill(headers, object) {
      if (object[Symbol.iterator]) {
        for (let header of object) {
          if (!header[Symbol.iterator]) {
            throw new TypeError();
          }
          if (typeof header === "string") {
            throw new TypeError();
          }
          if (!Array.isArray(header)) {
            header = [...header];
          }
          if (header.length !== 2) {
            throw new TypeError();
          }
          headers.append(header[0], header[1]);
        }
      } else if (object && typeof object === "object") {
        for (const header of Object.entries(object)) {
          headers.append(header[0], header[1]);
        }
      } else {
        throw TypeError();
      }
    }
    __name(fill, "fill");
    var HeadersList = class {
      constructor(init) {
        if (init instanceof HeadersList) {
          this[kHeadersMap] = new Map(init[kHeadersMap]);
          this[kHeadersSortedMap] = init[kHeadersSortedMap];
        } else {
          this[kHeadersMap] = new Map(init);
          this[kHeadersSortedMap] = null;
        }
      }
      clear() {
        this[kHeadersMap].clear();
        this[kHeadersSortedMap] = null;
      }
      append(name, value) {
        this[kHeadersSortedMap] = null;
        const normalizedName = normalizeAndValidateHeaderName(name);
        const normalizedValue = normalizeAndValidateHeaderValue(name, value);
        const exists = this[kHeadersMap].get(normalizedName);
        if (exists) {
          this[kHeadersMap].set(normalizedName, `${exists}, ${normalizedValue}`);
        } else {
          this[kHeadersMap].set(normalizedName, `${normalizedValue}`);
        }
      }
      set(name, value) {
        this[kHeadersSortedMap] = null;
        const normalizedName = normalizeAndValidateHeaderName(name);
        return this[kHeadersMap].set(normalizedName, value);
      }
      delete(name) {
        this[kHeadersSortedMap] = null;
        const normalizedName = normalizeAndValidateHeaderName(name);
        return this[kHeadersMap].delete(normalizedName);
      }
      get(name) {
        var _a2;
        const normalizedName = normalizeAndValidateHeaderName(name);
        return (_a2 = this[kHeadersMap].get(normalizedName)) != null ? _a2 : null;
      }
      has(name) {
        const normalizedName = normalizeAndValidateHeaderName(name);
        return this[kHeadersMap].has(normalizedName);
      }
      keys() {
        return this[kHeadersMap].keys();
      }
      values() {
        return this[kHeadersMap].values();
      }
      entries() {
        return this[kHeadersMap].entries();
      }
      [Symbol.iterator]() {
        return this[kHeadersMap][Symbol.iterator]();
      }
    };
    __name(HeadersList, "HeadersList");
    var Headers = class {
      constructor(...args) {
        var _a2;
        if (args[0] !== void 0 && !(typeof args[0] === "object" && args[0] != null) && !Array.isArray(args[0])) {
          throw new TypeError("Failed to construct 'Headers': The provided value is not of type '(record<ByteString, ByteString> or sequence<sequence<ByteString>>");
        }
        const init = args.length >= 1 ? (_a2 = args[0]) != null ? _a2 : {} : {};
        this[kHeadersList] = new HeadersList();
        this[kGuard] = "none";
        fill(this, init);
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      append(name, value) {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 2) {
          throw new TypeError(`Failed to execute 'append' on 'Headers': 2 arguments required, but only ${arguments.length} present.`);
        }
        if (this[kGuard] === "immutable") {
          throw new TypeError("immutable");
        } else if (this[kGuard] === "request-no-cors") {
        }
        return this[kHeadersList].append(String(name), String(value));
      }
      delete(name) {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(`Failed to execute 'delete' on 'Headers': 1 argument required, but only ${arguments.length} present.`);
        }
        if (this[kGuard] === "immutable") {
          throw new TypeError("immutable");
        } else if (this[kGuard] === "request-no-cors") {
        }
        return this[kHeadersList].delete(String(name));
      }
      get(name) {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(`Failed to execute 'get' on 'Headers': 1 argument required, but only ${arguments.length} present.`);
        }
        return this[kHeadersList].get(String(name));
      }
      has(name) {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(`Failed to execute 'has' on 'Headers': 1 argument required, but only ${arguments.length} present.`);
        }
        return this[kHeadersList].has(String(name));
      }
      set(name, value) {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 2) {
          throw new TypeError(`Failed to execute 'set' on 'Headers': 2 arguments required, but only ${arguments.length} present.`);
        }
        if (this[kGuard] === "immutable") {
          throw new TypeError("immutable");
        } else if (this[kGuard] === "request-no-cors") {
        }
        return this[kHeadersList].set(String(name), String(value));
      }
      get [kHeadersSortedMap]() {
        var _a2, _b;
        (_b = (_a2 = this[kHeadersList])[kHeadersSortedMap]) != null ? _b : _a2[kHeadersSortedMap] = new Map([...this[kHeadersList]].sort((a, b) => a[0] < b[0] ? -1 : 1));
        return this[kHeadersList][kHeadersSortedMap];
      }
      keys() {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(this[kHeadersSortedMap].keys(), "Headers");
      }
      values() {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(this[kHeadersSortedMap].values(), "Headers");
      }
      entries() {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(this[kHeadersSortedMap].entries(), "Headers");
      }
      forEach(callbackFn, thisArg = globalThis) {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(`Failed to execute 'forEach' on 'Headers': 1 argument required, but only ${arguments.length} present.`);
        }
        if (typeof callbackFn !== "function") {
          throw new TypeError("Failed to execute 'forEach' on 'Headers': parameter 1 is not of type 'Function'.");
        }
        for (const [key, value] of this) {
          callbackFn.apply(thisArg, [value, key, this]);
        }
      }
      [Symbol.for("nodejs.util.inspect.custom")]() {
        if (!(this instanceof Headers)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kHeadersList];
      }
    };
    __name(Headers, "Headers");
    Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
    Object.defineProperties(Headers.prototype, {
      append: kEnumerableProperty,
      delete: kEnumerableProperty,
      get: kEnumerableProperty,
      has: kEnumerableProperty,
      set: kEnumerableProperty,
      keys: kEnumerableProperty,
      values: kEnumerableProperty,
      entries: kEnumerableProperty,
      forEach: kEnumerableProperty
    });
    module2.exports = {
      fill,
      Headers,
      HeadersList,
      normalizeAndValidateHeaderName,
      normalizeAndValidateHeaderValue
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/formdata.js
var require_formdata = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/formdata.js"(exports, module2) {
    "use strict";
    var { isBlobLike, isFileLike, toUSVString, makeIterator } = require_util2();
    var { kState } = require_symbols2();
    var { File, FileLike } = require_file();
    var { Blob } = require_buffer();
    var _FormData = class {
      constructor(...args) {
        var _a2, _b;
        if (args.length > 0 && !(((_b = (_a2 = args[0]) == null ? void 0 : _a2.constructor) == null ? void 0 : _b.name) === "HTMLFormElement")) {
          throw new TypeError("Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'");
        }
        this[kState] = [];
      }
      append(...args) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (args.length < 2) {
          throw new TypeError(`Failed to execute 'append' on 'FormData': 2 arguments required, but only ${args.length} present.`);
        }
        if (args.length === 3 && !isBlobLike(args[1])) {
          throw new TypeError("Failed to execute 'append' on 'FormData': parameter 2 is not of type 'Blob'");
        }
        const name = toUSVString(args[0]);
        const filename = args.length === 3 ? toUSVString(args[2]) : void 0;
        const value = isBlobLike(args[1]) ? args[1] : toUSVString(args[1]);
        const entry = makeEntry(name, value, filename);
        this[kState].push(entry);
      }
      delete(...args) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (args.length < 1) {
          throw new TypeError(`Failed to execute 'delete' on 'FormData': 1 arguments required, but only ${args.length} present.`);
        }
        const name = toUSVString(args[0]);
        const next = [];
        for (const entry of this[kState]) {
          if (entry.name !== name) {
            next.push(entry);
          }
        }
        this[kState] = next;
      }
      get(...args) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (args.length < 1) {
          throw new TypeError(`Failed to execute 'get' on 'FormData': 1 arguments required, but only ${args.length} present.`);
        }
        const name = toUSVString(args[0]);
        const idx = this[kState].findIndex((entry) => entry.name === name);
        if (idx === -1) {
          return null;
        }
        return this[kState][idx].value;
      }
      getAll(...args) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (args.length < 1) {
          throw new TypeError(`Failed to execute 'getAll' on 'FormData': 1 arguments required, but only ${args.length} present.`);
        }
        const name = toUSVString(args[0]);
        return this[kState].filter((entry) => entry.name === name).map((entry) => entry.value);
      }
      has(...args) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (args.length < 1) {
          throw new TypeError(`Failed to execute 'has' on 'FormData': 1 arguments required, but only ${args.length} present.`);
        }
        const name = toUSVString(args[0]);
        return this[kState].findIndex((entry) => entry.name === name) !== -1;
      }
      set(...args) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (args.length < 2) {
          throw new TypeError(`Failed to execute 'set' on 'FormData': 2 arguments required, but only ${args.length} present.`);
        }
        if (args.length === 3 && !isBlobLike(args[1])) {
          throw new TypeError("Failed to execute 'set' on 'FormData': parameter 2 is not of type 'Blob'");
        }
        const name = toUSVString(args[0]);
        const filename = args.length === 3 ? toUSVString(args[2]) : void 0;
        const value = isBlobLike(args[1]) ? args[1] : toUSVString(args[1]);
        const entry = makeEntry(name, value, filename);
        const idx = this[kState].findIndex((entry2) => entry2.name === name);
        if (idx !== -1) {
          this[kState] = [
            ...this[kState].slice(0, idx),
            entry,
            ...this[kState].slice(idx + 1).filter((entry2) => entry2.name !== name)
          ];
        } else {
          this[kState].push(entry);
        }
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      entries() {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(makeIterable(this[kState], "entries"), "FormData");
      }
      keys() {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(makeIterable(this[kState], "keys"), "FormData");
      }
      values() {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(makeIterable(this[kState], "values"), "FormData");
      }
      forEach(callbackFn, thisArg = globalThis) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(`Failed to execute 'forEach' on 'FormData': 1 argument required, but only ${arguments.length} present.`);
        }
        if (typeof callbackFn !== "function") {
          throw new TypeError("Failed to execute 'forEach' on 'FormData': parameter 1 is not of type 'Function'.");
        }
        for (const [key, value] of this) {
          callbackFn.apply(thisArg, [value, key, this]);
        }
      }
    };
    var FormData = _FormData;
    __name(FormData, "FormData");
    __publicField(FormData, "name", "FormData");
    FormData.prototype[Symbol.iterator] = FormData.prototype.entries;
    function makeEntry(name, value, filename) {
      const entry = {
        name: null,
        value: null
      };
      entry.name = name;
      if (isBlobLike(value) && !isFileLike(value)) {
        value = value instanceof Blob ? new File([value], "blob", value) : new FileLike(value, "blob", value);
      }
      if (isFileLike(value) && filename != null) {
        value = value instanceof File ? new File([value], filename, value) : new FileLike(value, filename, value);
      }
      entry.value = value;
      return entry;
    }
    __name(makeEntry, "makeEntry");
    function* makeIterable(entries, type) {
      for (const { name, value } of entries) {
        if (type === "entries") {
          yield [name, value];
        } else if (type === "values") {
          yield value;
        } else {
          yield name;
        }
      }
    }
    __name(makeIterable, "makeIterable");
    module2.exports = { FormData };
  }
});

// src/polyfills/util-types.js
var require_util_types = __commonJS({
  "src/polyfills/util-types.js"(exports, module2) {
    module2.exports = require("util").types;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/body.js
var require_body = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/body.js"(exports, module2) {
    "use strict";
    var util = require_util();
    var { ReadableStreamFrom, toUSVString, isBlobLike } = require_util2();
    var { FormData } = require_formdata();
    var { kState } = require_symbols2();
    var { Blob } = require_buffer();
    var { kBodyUsed } = require_symbols();
    var assert = require("assert");
    var { NotSupportedError } = require_errors();
    var { isErrored } = require_util();
    var { isUint8Array, isArrayBuffer } = require_util_types();
    var ReadableStream;
    async function* blobGen(blob) {
      if (blob.stream) {
        yield* blob.stream();
      } else {
        yield await blob.arrayBuffer();
      }
    }
    __name(blobGen, "blobGen");
    function extractBody(object, keepalive = false) {
      if (!ReadableStream) {
        ReadableStream = require_web_streams().ReadableStream;
      }
      let stream = null;
      let action = null;
      let source = null;
      let length = null;
      let contentType = null;
      if (object == null) {
      } else if (object instanceof URLSearchParams) {
        source = object.toString();
        contentType = "application/x-www-form-urlencoded;charset=UTF-8";
      } else if (isArrayBuffer(object) || ArrayBuffer.isView(object)) {
        if (object instanceof DataView) {
          object = object.buffer;
        }
        source = new Uint8Array(object);
      } else if (util.isFormDataLike(object)) {
        const boundary = "----formdata-undici-" + Math.random();
        const prefix = `--${boundary}\r
Content-Disposition: form-data`;
        const escape2 = /* @__PURE__ */ __name((str) => str.replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/"/g, "%22"), "escape");
        const normalizeLinefeeds = /* @__PURE__ */ __name((value) => value.replace(/\r?\n|\r/g, "\r\n"), "normalizeLinefeeds");
        action = /* @__PURE__ */ __name(async function* (object2) {
          const enc = new TextEncoder();
          for (const [name, value] of object2) {
            if (typeof value === "string") {
              yield enc.encode(prefix + `; name="${escape2(normalizeLinefeeds(name))}"\r
\r
${normalizeLinefeeds(value)}\r
`);
            } else {
              yield enc.encode(prefix + `; name="${escape2(normalizeLinefeeds(name))}"` + (value.name ? `; filename="${escape2(value.name)}"` : "") + `\r
Content-Type: ${value.type || "application/octet-stream"}\r
\r
`);
              yield* blobGen(value);
              yield enc.encode("\r\n");
            }
          }
          yield enc.encode(`--${boundary}--`);
        }, "action");
        source = object;
        contentType = "multipart/form-data; boundary=" + boundary;
      } else if (isBlobLike(object)) {
        action = blobGen;
        source = object;
        length = object.size;
        if (object.type) {
          contentType = object.type;
        }
      } else if (typeof object[Symbol.asyncIterator] === "function") {
        if (keepalive) {
          throw new TypeError("keepalive");
        }
        if (util.isDisturbed(object) || object.locked) {
          throw new TypeError("Response body object should not be disturbed or locked");
        }
        stream = object instanceof ReadableStream ? object : ReadableStreamFrom(object);
      } else {
        source = toUSVString(object);
        contentType = "text/plain;charset=UTF-8";
      }
      if (typeof source === "string" || util.isBuffer(source)) {
        length = Buffer.byteLength(source);
      }
      if (action != null) {
        let iterator;
        stream = new ReadableStream({
          async start() {
            iterator = action(object)[Symbol.asyncIterator]();
          },
          async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) {
              queueMicrotask(() => {
                controller.close();
              });
            } else {
              if (!isErrored(stream)) {
                controller.enqueue(new Uint8Array(value));
              }
            }
            return controller.desiredSize > 0;
          },
          async cancel(reason) {
            await iterator.return();
          }
        });
      } else if (!stream) {
        stream = new ReadableStream({
          async pull(controller) {
            controller.enqueue(typeof source === "string" ? new TextEncoder().encode(source) : source);
            queueMicrotask(() => {
              controller.close();
            });
          }
        });
      }
      const body = { stream, source, length };
      return [body, contentType];
    }
    __name(extractBody, "extractBody");
    function safelyExtractBody(object, keepalive = false) {
      if (!ReadableStream) {
        ReadableStream = require_web_streams().ReadableStream;
      }
      if (object instanceof ReadableStream) {
        assert(!util.isDisturbed(object), "disturbed");
        assert(!object.locked, "locked");
      }
      return extractBody(object, keepalive);
    }
    __name(safelyExtractBody, "safelyExtractBody");
    function cloneBody(body) {
      const [out1, out2] = body.stream.tee();
      body.stream = out1;
      return {
        stream: out2,
        length: body.length,
        source: body.source
      };
    }
    __name(cloneBody, "cloneBody");
    var methods = {
      async blob() {
        const chunks = [];
        if (this[kState].body) {
          if (isUint8Array(this[kState].body)) {
            chunks.push(this[kState].body);
          } else {
            const stream = this[kState].body.stream;
            if (util.isDisturbed(stream)) {
              throw new TypeError("disturbed");
            }
            if (stream.locked) {
              throw new TypeError("locked");
            }
            stream[kBodyUsed] = true;
            for await (const chunk of stream) {
              chunks.push(chunk);
            }
          }
        }
        return new Blob(chunks, { type: this.headers.get("Content-Type") || "" });
      },
      async arrayBuffer() {
        const blob = await this.blob();
        return await blob.arrayBuffer();
      },
      async text() {
        const blob = await this.blob();
        return toUSVString(await blob.text());
      },
      async json() {
        return JSON.parse(await this.text());
      },
      async formData() {
        const contentType = this.headers.get("Content-Type");
        if (/multipart\/form-data/.test(contentType)) {
          throw new NotSupportedError("multipart/form-data not supported");
        } else if (/application\/x-www-form-urlencoded/.test(contentType)) {
          let entries;
          try {
            entries = new URLSearchParams(await this.text());
          } catch (err) {
            throw Object.assign(new TypeError(), { cause: err });
          }
          const formData = new FormData();
          for (const [name, value] of entries) {
            formData.append(name, value);
          }
          return formData;
        } else {
          throw new TypeError();
        }
      }
    };
    var properties = {
      body: {
        enumerable: true,
        get() {
          return this[kState].body ? this[kState].body.stream : null;
        }
      },
      bodyUsed: {
        enumerable: true,
        get() {
          return !!this[kState].body && util.isDisturbed(this[kState].body.stream);
        }
      }
    };
    function mixinBody(prototype) {
      Object.assign(prototype, methods);
      Object.defineProperties(prototype, properties);
    }
    __name(mixinBody, "mixinBody");
    module2.exports = {
      extractBody,
      safelyExtractBody,
      cloneBody,
      mixinBody
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/response.js
var require_response = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/response.js"(exports, module2) {
    "use strict";
    var { Headers, HeadersList, fill } = require_headers();
    var { AbortError } = require_errors();
    var { extractBody, cloneBody, mixinBody } = require_body();
    var util = require_util();
    var { kEnumerableProperty } = util;
    var { responseURL, isValidReasonPhrase, toUSVString, isCancelled, isAborted, serializeJavascriptValueToJSONString } = require_util2();
    var {
      redirectStatus,
      nullBodyStatus
    } = require_constants2();
    var { kState, kHeaders, kGuard, kRealm } = require_symbols2();
    var { kHeadersList } = require_symbols();
    var assert = require("assert");
    var Response = class {
      static error() {
        const relevantRealm = { settingsObject: {} };
        const responseObject = new Response();
        responseObject[kState] = makeNetworkError();
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders][kHeadersList] = responseObject[kState].headersList;
        responseObject[kHeaders][kGuard] = "immutable";
        responseObject[kHeaders][kRealm] = relevantRealm;
        return responseObject;
      }
      static json(data, init = {}) {
        if (arguments.length === 0) {
          throw new TypeError("Failed to execute 'json' on 'Response': 1 argument required, but 0 present.");
        }
        if (init === null || typeof init !== "object") {
          throw new TypeError(`Failed to execute 'json' on 'Response': init must be a RequestInit, found ${typeof init}.`);
        }
        init = {
          status: 200,
          statusText: "",
          headers: new HeadersList(),
          ...init
        };
        const bytes = new TextEncoder("utf-8").encode(serializeJavascriptValueToJSONString(data));
        const body = extractBody(bytes);
        const relevantRealm = { settingsObject: {} };
        const responseObject = new Response();
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders][kGuard] = "response";
        responseObject[kHeaders][kRealm] = relevantRealm;
        initializeResponse(responseObject, init, { body: body[0], type: "application/json" });
        return responseObject;
      }
      static redirect(...args) {
        const relevantRealm = { settingsObject: {} };
        if (args.length < 1) {
          throw new TypeError(`Failed to execute 'redirect' on 'Response': 1 argument required, but only ${args.length} present.`);
        }
        const status = args.length >= 2 ? args[1] : 302;
        const url = toUSVString(args[0]);
        let parsedURL;
        try {
          parsedURL = new URL(url);
        } catch (err) {
          throw Object.assign(new TypeError("Failed to parse URL from " + url), {
            cause: err
          });
        }
        if (!redirectStatus.includes(status)) {
          throw new RangeError("Invalid status code");
        }
        const responseObject = new Response();
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders][kGuard] = "immutable";
        responseObject[kHeaders][kRealm] = relevantRealm;
        responseObject[kState].status = status;
        const value = parsedURL.toString();
        responseObject[kState].headersList.append("location", value);
        return responseObject;
      }
      constructor(...args) {
        var _a2;
        if (args.length >= 1 && typeof args[1] !== "object" && args[1] !== void 0) {
          throw new TypeError("Failed to construct 'Request': cannot convert to dictionary.");
        }
        const body = args.length >= 1 ? args[0] : null;
        const init = args.length >= 2 ? (_a2 = args[1]) != null ? _a2 : {} : {};
        this[kRealm] = { settingsObject: {} };
        this[kState] = makeResponse({});
        this[kHeaders] = new Headers();
        this[kHeaders][kGuard] = "response";
        this[kHeaders][kHeadersList] = this[kState].headersList;
        this[kHeaders][kRealm] = this[kRealm];
        let bodyWithType = null;
        if (body != null) {
          const [extractedBody, type] = extractBody(body);
          bodyWithType = { body: extractedBody, type };
        }
        initializeResponse(this, init, bodyWithType);
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      get type() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].type;
      }
      get url() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        let url = responseURL(this[kState]);
        if (url == null) {
          return "";
        }
        if (url.hash) {
          url = new URL(url);
          url.hash = "";
        }
        return url.toString();
      }
      get redirected() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].urlList.length > 1;
      }
      get status() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].status;
      }
      get ok() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].status >= 200 && this[kState].status <= 299;
      }
      get statusText() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].statusText;
      }
      get headers() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kHeaders];
      }
      clone() {
        if (!(this instanceof Response)) {
          throw new TypeError("Illegal invocation");
        }
        if (this.bodyUsed || this.body && this.body.locked) {
          throw new TypeError();
        }
        const clonedResponse = cloneResponse(this[kState]);
        const clonedResponseObject = new Response();
        clonedResponseObject[kState] = clonedResponse;
        clonedResponseObject[kRealm] = this[kRealm];
        clonedResponseObject[kHeaders][kHeadersList] = clonedResponse.headersList;
        clonedResponseObject[kHeaders][kGuard] = this[kHeaders][kGuard];
        clonedResponseObject[kHeaders][kRealm] = this[kHeaders][kRealm];
        return clonedResponseObject;
      }
    };
    __name(Response, "Response");
    mixinBody(Response.prototype);
    Object.defineProperties(Response.prototype, {
      type: kEnumerableProperty,
      url: kEnumerableProperty,
      status: kEnumerableProperty,
      ok: kEnumerableProperty,
      redirected: kEnumerableProperty,
      statusText: kEnumerableProperty,
      headers: kEnumerableProperty,
      clone: kEnumerableProperty
    });
    function cloneResponse(response) {
      if (response.internalResponse) {
        return filterResponse(cloneResponse(response.internalResponse), response.type);
      }
      const newResponse = makeResponse({ ...response, body: null });
      if (response.body != null) {
        newResponse.body = cloneBody(response.body);
      }
      return newResponse;
    }
    __name(cloneResponse, "cloneResponse");
    function makeResponse(init) {
      return {
        aborted: false,
        rangeRequested: false,
        timingAllowPassed: false,
        requestIncludesCredentials: false,
        type: "default",
        status: 200,
        timingInfo: null,
        cacheState: "",
        statusText: "",
        ...init,
        headersList: init.headersList ? new HeadersList(init.headersList) : new HeadersList(),
        urlList: init.urlList ? [...init.urlList] : []
      };
    }
    __name(makeResponse, "makeResponse");
    function makeNetworkError(reason) {
      return makeResponse({
        type: "error",
        status: 0,
        error: reason instanceof Error ? reason : new Error(reason ? String(reason) : reason, {
          cause: reason instanceof Error ? reason : void 0
        }),
        aborted: reason && reason.name === "AbortError"
      });
    }
    __name(makeNetworkError, "makeNetworkError");
    function makeFilteredResponse(response, state) {
      state = {
        internalResponse: response,
        ...state
      };
      return new Proxy(response, {
        get(target, p) {
          return p in state ? state[p] : target[p];
        },
        set(target, p, value) {
          assert(!(p in state));
          target[p] = value;
          return true;
        }
      });
    }
    __name(makeFilteredResponse, "makeFilteredResponse");
    function filterResponse(response, type) {
      if (type === "basic") {
        return makeFilteredResponse(response, {
          type: "basic",
          headersList: response.headersList
        });
      } else if (type === "cors") {
        return makeFilteredResponse(response, {
          type: "cors",
          headersList: response.headersList
        });
      } else if (type === "opaque") {
        return makeFilteredResponse(response, {
          type: "opaque",
          urlList: Object.freeze([]),
          status: 0,
          statusText: "",
          body: null
        });
      } else if (type === "opaqueredirect") {
        return makeFilteredResponse(response, {
          type: "opaqueredirect",
          status: 0,
          statusText: "",
          headersList: [],
          body: null
        });
      } else {
        assert(false);
      }
    }
    __name(filterResponse, "filterResponse");
    function makeAppropriateNetworkError(fetchParams) {
      assert(isCancelled(fetchParams));
      return isAborted(fetchParams) ? makeNetworkError(new AbortError()) : makeNetworkError(fetchParams.controller.terminated.reason);
    }
    __name(makeAppropriateNetworkError, "makeAppropriateNetworkError");
    function initializeResponse(response, init, body) {
      if (init.status != null && (init.status < 200 || init.status > 599)) {
        throw new RangeError('init["status"] must be in the range of 200 to 599, inclusive.');
      }
      if ("statusText" in init && init.statusText != null) {
        if (!isValidReasonPhrase(String(init.statusText))) {
          throw new TypeError("Invalid statusText");
        }
      }
      if ("status" in init && init.status != null) {
        response[kState].status = init.status;
      }
      if ("statusText" in init && init.statusText != null) {
        response[kState].statusText = init.statusText;
      }
      if ("headers" in init && init.headers != null) {
        fill(response[kState].headersList, init.headers);
      }
      if (body) {
        if (nullBodyStatus.includes(response.status)) {
          throw new TypeError();
        }
        response[kState].body = body.body;
        if (body.type != null && !response[kState].headersList.has("Content-Type")) {
          response[kState].headersList.append("content-type", body.type);
        }
      }
    }
    __name(initializeResponse, "initializeResponse");
    module2.exports = {
      makeNetworkError,
      makeResponse,
      makeAppropriateNetworkError,
      filterResponse,
      Response
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/request.js
var require_request = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/request.js"(exports, module2) {
    "use strict";
    var { extractBody, mixinBody, cloneBody } = require_body();
    var { Headers, fill: fillHeaders, HeadersList } = require_headers();
    var util = require_util();
    var {
      isValidHTTPToken,
      sameOrigin,
      toUSVString,
      normalizeMethod
    } = require_util2();
    var {
      forbiddenMethods,
      corsSafeListedMethods,
      referrerPolicy,
      requestRedirect,
      requestMode,
      requestCredentials,
      requestCache
    } = require_constants2();
    var { kEnumerableProperty } = util;
    var { kHeaders, kSignal, kState, kGuard, kRealm } = require_symbols2();
    var { kHeadersList } = require_symbols();
    var assert = require("assert");
    var TransformStream;
    var kInit = Symbol("init");
    var requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
      signal.removeEventListener("abort", abort);
    });
    var Request = class {
      constructor(...args) {
        var _a2, _b, _c;
        if (args[0] === kInit) {
          return;
        }
        if (args.length < 1) {
          throw new TypeError(`Failed to construct 'Request': 1 argument required, but only ${args.length} present.`);
        }
        if (args.length >= 1 && typeof args[1] !== "object" && args[1] !== void 0) {
          throw new TypeError("Failed to construct 'Request': cannot convert to dictionary.");
        }
        const input = args[0] instanceof Request ? args[0] : toUSVString(args[0]);
        const init = args.length >= 1 ? (_a2 = args[1]) != null ? _a2 : {} : {};
        this[kRealm] = { settingsObject: {} };
        let request = null;
        let fallbackMode = null;
        const baseUrl = this[kRealm].settingsObject.baseUrl;
        let signal = null;
        if (typeof input === "string") {
          let parsedURL;
          try {
            parsedURL = new URL(input, baseUrl);
          } catch (err) {
            throw new TypeError("Failed to parse URL from " + input, { cause: err });
          }
          if (parsedURL.username || parsedURL.password) {
            throw new TypeError("Request cannot be constructed from a URL that includes credentials: " + input);
          }
          request = makeRequest({ urlList: [parsedURL] });
          fallbackMode = "cors";
        } else {
          assert(input instanceof Request);
          request = input[kState];
          signal = input[kSignal];
        }
        const origin = this[kRealm].settingsObject.origin;
        let window2 = "client";
        if (((_c = (_b = request.window) == null ? void 0 : _b.constructor) == null ? void 0 : _c.name) === "EnvironmentSettingsObject" && sameOrigin(request.window, origin)) {
          window2 = request.window;
        }
        if (init.window !== void 0 && init.window != null) {
          throw new TypeError(`'window' option '${window2}' must be null`);
        }
        if (init.window !== void 0) {
          window2 = "no-window";
        }
        request = makeRequest({
          method: request.method,
          headersList: request.headersList,
          unsafeRequest: request.unsafeRequest,
          client: this[kRealm].settingsObject,
          window: window2,
          priority: request.priority,
          origin: request.origin,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          mode: request.mode,
          credentials: request.credentials,
          cache: request.cache,
          redirect: request.redirect,
          integrity: request.integrity,
          keepalive: request.keepalive,
          reloadNavigation: request.reloadNavigation,
          historyNavigation: request.historyNavigation,
          urlList: [...request.urlList]
        });
        if (Object.keys(init).length > 0) {
          if (request.mode === "navigate") {
            request.mode = "same-origin";
          }
          request.reloadNavigation = false;
          request.historyNavigation = false;
          request.origin = "client";
          request.referrer = "client";
          request.referrerPolicy = "";
          request.url = request.urlList[request.urlList.length - 1];
          request.urlList = [request.url];
        }
        if (init.referrer !== void 0) {
          const referrer = init.referrer;
          if (referrer === "") {
            request.referrer = "no-referrer";
          } else {
            let parsedReferrer;
            try {
              parsedReferrer = new URL(referrer, baseUrl);
            } catch (err) {
              throw new TypeError(`Referrer "${referrer}" is not a valid URL.`, { cause: err });
            }
            request.referrer = parsedReferrer;
          }
        }
        if (init.referrerPolicy !== void 0) {
          request.referrerPolicy = init.referrerPolicy;
          if (!referrerPolicy.includes(request.referrerPolicy)) {
            throw new TypeError(`Failed to construct 'Request': The provided value '${request.referrerPolicy}' is not a valid enum value of type ReferrerPolicy.`);
          }
        }
        let mode;
        if (init.mode !== void 0) {
          mode = init.mode;
          if (!requestMode.includes(mode)) {
            throw new TypeError(`Failed to construct 'Request': The provided value '${request.mode}' is not a valid enum value of type RequestMode.`);
          }
        } else {
          mode = fallbackMode;
        }
        if (mode === "navigate") {
          throw new TypeError();
        }
        if (mode != null) {
          request.mode = mode;
        }
        if (init.credentials !== void 0) {
          request.credentials = init.credentials;
          if (!requestCredentials.includes(request.credentials)) {
            throw new TypeError(`Failed to construct 'Request': The provided value '${request.credentials}' is not a valid enum value of type RequestCredentials.`);
          }
        }
        if (init.cache !== void 0) {
          request.cache = init.cache;
          if (!requestCache.includes(request.cache)) {
            throw new TypeError(`Failed to construct 'Request': The provided value '${request.cache}' is not a valid enum value of type RequestCache.`);
          }
        }
        if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
          throw new TypeError("'only-if-cached' can be set only with 'same-origin' mode");
        }
        if (init.redirect !== void 0) {
          request.redirect = init.redirect;
          if (!requestRedirect.includes(request.redirect)) {
            throw new TypeError(`Failed to construct 'Request': The provided value '${request.redirect}' is not a valid enum value of type RequestRedirect.`);
          }
        }
        if (init.integrity !== void 0 && init.integrity != null) {
          request.integrity = String(init.integrity);
        }
        if (init.keepalive !== void 0) {
          request.keepalive = Boolean(init.keepalive);
        }
        if (init.method !== void 0) {
          let method = init.method;
          if (!isValidHTTPToken(init.method)) {
            throw TypeError(`'${init.method}' is not a valid HTTP method.`);
          }
          if (forbiddenMethods.indexOf(method.toUpperCase()) !== -1) {
            throw TypeError(`'${init.method}' HTTP method is unsupported.`);
          }
          method = normalizeMethod(init.method);
          request.method = method;
        }
        if (init.signal !== void 0) {
          signal = init.signal;
        }
        this[kState] = request;
        const ac = new AbortController();
        this[kSignal] = ac.signal;
        this[kSignal][kRealm] = this[kRealm];
        if (signal != null) {
          if (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function") {
            throw new TypeError("Failed to construct 'Request': member signal is not of type AbortSignal.");
          }
          if (signal.aborted) {
            ac.abort();
          } else {
            const abort = /* @__PURE__ */ __name(() => ac.abort(), "abort");
            signal.addEventListener("abort", abort, { once: true });
            requestFinalizer.register(this, { signal, abort });
          }
        }
        this[kHeaders] = new Headers();
        this[kHeaders][kHeadersList] = request.headersList;
        this[kHeaders][kGuard] = "request";
        this[kHeaders][kRealm] = this[kRealm];
        if (mode === "no-cors") {
          if (!corsSafeListedMethods.includes(request.method)) {
            throw new TypeError(`'${request.method} is unsupported in no-cors mode.`);
          }
          this[kHeaders][kGuard] = "request-no-cors";
        }
        if (Object.keys(init).length !== 0) {
          let headers = new Headers(this[kHeaders]);
          if (init.headers !== void 0) {
            headers = init.headers;
          }
          this[kHeaders][kHeadersList].clear();
          if (headers.constructor.name === "Headers") {
            for (const [key, val] of headers) {
              this[kHeaders].append(key, val);
            }
          } else {
            fillHeaders(this[kHeaders], headers);
          }
        }
        const inputBody = input instanceof Request ? input[kState].body : null;
        if ((init.body !== void 0 && init.body != null || inputBody != null) && (request.method === "GET" || request.method === "HEAD")) {
          throw new TypeError("Request with GET/HEAD method cannot have body.");
        }
        let initBody = null;
        if (init.body !== void 0 && init.body != null) {
          const [extractedBody, contentType] = extractBody(init.body, request.keepalive);
          initBody = extractedBody;
          if (contentType && !this[kHeaders].has("content-type")) {
            this[kHeaders].append("content-type", contentType);
          }
        }
        const inputOrInitBody = initBody != null ? initBody : inputBody;
        if (inputOrInitBody != null && inputOrInitBody.source == null) {
          if (request.mode !== "same-origin" && request.mode !== "cors") {
            throw new TypeError('If request is made from ReadableStream, mode should be "same-origin" or "cors"');
          }
          request.useCORSPreflightFlag = true;
        }
        let finalBody = inputOrInitBody;
        if (initBody == null && inputBody != null) {
          if (util.isDisturbed(inputBody.stream) || inputBody.stream.locked) {
            throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
          }
          if (!TransformStream) {
            TransformStream = require_web_streams().TransformStream;
          }
          const identityTransform = new TransformStream();
          inputBody.stream.pipeThrough(identityTransform);
          finalBody = {
            source: inputBody.source,
            length: inputBody.length,
            stream: identityTransform.readable
          };
        }
        this[kState].body = finalBody;
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      get method() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].method;
      }
      get url() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].url.toString();
      }
      get headers() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kHeaders];
      }
      get destination() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].destination;
      }
      get referrer() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        if (this[kState].referrer === "no-referrer") {
          return "";
        }
        if (this[kState].referrer === "client") {
          return "about:client";
        }
        return this[kState].referrer.toString();
      }
      get referrerPolicy() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].referrerPolicy;
      }
      get mode() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].mode;
      }
      get credentials() {
        return this[kState].credentials;
      }
      get cache() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].cache;
      }
      get redirect() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].redirect;
      }
      get integrity() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].integrity;
      }
      get keepalive() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].keepalive;
      }
      get isReloadNavigation() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].reloadNavigation;
      }
      get isHistoryNavigation() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].historyNavigation;
      }
      get signal() {
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kSignal];
      }
      clone() {
        var _a2;
        if (!(this instanceof Request)) {
          throw new TypeError("Illegal invocation");
        }
        if (this.bodyUsed || ((_a2 = this.body) == null ? void 0 : _a2.locked)) {
          throw new TypeError("unusable");
        }
        const clonedRequest = cloneRequest(this[kState]);
        const clonedRequestObject = new Request(kInit);
        clonedRequestObject[kState] = clonedRequest;
        clonedRequestObject[kRealm] = this[kRealm];
        clonedRequestObject[kHeaders] = new Headers();
        clonedRequestObject[kHeaders][kHeadersList] = clonedRequest.headersList;
        clonedRequestObject[kHeaders][kGuard] = this[kHeaders][kGuard];
        clonedRequestObject[kHeaders][kRealm] = this[kHeaders][kRealm];
        const ac = new AbortController();
        if (this.signal.aborted) {
          ac.abort();
        } else {
          this.signal.addEventListener("abort", function() {
            ac.abort();
          }, { once: true });
        }
        clonedRequestObject[kSignal] = ac.signal;
        return clonedRequestObject;
      }
    };
    __name(Request, "Request");
    mixinBody(Request.prototype);
    function makeRequest(init) {
      const request = {
        method: "GET",
        localURLsOnly: false,
        unsafeRequest: false,
        body: null,
        client: null,
        reservedClient: null,
        replacesClientId: "",
        window: "client",
        keepalive: false,
        serviceWorkers: "all",
        initiator: "",
        destination: "",
        priority: null,
        origin: "client",
        policyContainer: "client",
        referrer: "client",
        referrerPolicy: "",
        mode: "no-cors",
        useCORSPreflightFlag: false,
        credentials: "same-origin",
        useCredentials: false,
        cache: "default",
        redirect: "follow",
        integrity: "",
        cryptoGraphicsNonceMetadata: "",
        parserMetadata: "",
        reloadNavigation: false,
        historyNavigation: false,
        userActivation: false,
        taintedOrigin: false,
        redirectCount: 0,
        responseTainting: "basic",
        preventNoCacheCacheControlHeaderModification: false,
        done: false,
        timingAllowFailed: false,
        ...init,
        headersList: init.headersList ? new HeadersList(init.headersList) : new HeadersList()
      };
      request.url = request.urlList[0];
      return request;
    }
    __name(makeRequest, "makeRequest");
    function cloneRequest(request) {
      const newRequest = makeRequest({ ...request, body: null });
      if (request.body != null) {
        newRequest.body = cloneBody(request.body);
      }
      return newRequest;
    }
    __name(cloneRequest, "cloneRequest");
    Object.defineProperties(Request.prototype, {
      method: kEnumerableProperty,
      url: kEnumerableProperty,
      headers: kEnumerableProperty,
      redirect: kEnumerableProperty,
      clone: kEnumerableProperty,
      signal: kEnumerableProperty
    });
    module2.exports = { Request, makeRequest };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/dataURL.js
var require_dataURL = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/dataURL.js"(exports, module2) {
    var assert = require("assert");
    var { atob: atob2 } = require_buffer();
    var encoder = new TextEncoder();
    function dataURLProcessor(dataURL) {
      assert(dataURL.protocol === "data:");
      let input = URLSerializer(dataURL, true);
      input = input.slice(5);
      const position = { position: 0 };
      let mimeType = collectASequenceOfCodePoints((char) => char !== ",", input, position);
      const mimeTypeLength = mimeType.length;
      mimeType = mimeType.replace(/^(\u0020)+|(\u0020)+$/g, "");
      if (position.position >= input.length) {
        return "failure";
      }
      position.position++;
      const encodedBody = input.slice(mimeTypeLength + 1);
      let body = stringPercentDecode(encodedBody);
      if (/;(\u0020){0,}base64$/i.test(mimeType)) {
        const stringBody = decodeURIComponent(new TextDecoder("utf-8").decode(body));
        body = forgivingBase64(stringBody);
        if (body === "failure") {
          return "failure";
        }
        mimeType = mimeType.slice(0, -6);
        mimeType = mimeType.replace(/(\u0020)+$/, "");
        mimeType = mimeType.slice(0, -1);
      }
      if (mimeType.startsWith(";")) {
        mimeType = "text/plain" + mimeType;
      }
      let mimeTypeRecord = parseMIMEType(mimeType);
      if (mimeTypeRecord === "failure") {
        mimeTypeRecord = parseMIMEType("text/plain;charset=US-ASCII");
      }
      return { mimeType: mimeTypeRecord, body };
    }
    __name(dataURLProcessor, "dataURLProcessor");
    function URLSerializer(url, excludeFragment = false) {
      let output = url.protocol;
      if (url.host.length > 0) {
        output += "//";
        if (url.username.length > 0 || url.password.length > 0) {
          output += url.username;
          if (url.password.length > 0) {
            output += ":" + url.password;
          }
          output += "@";
        }
        output += decodeURIComponent(url.host);
        if (url.port.length > 0) {
          output += ":" + url.port;
        }
      }
      if (url.host.length === 0 && url.pathname.length > 1 && url.href.slice(url.protocol.length + 1)[0] === ".") {
        output += "/.";
      }
      output += url.pathname;
      if (url.search.length > 0) {
        output += url.search;
      }
      if (excludeFragment === false && url.hash.length > 0) {
        output += url.hash;
      }
      return output;
    }
    __name(URLSerializer, "URLSerializer");
    function collectASequenceOfCodePoints(condition, input, position) {
      let result = "";
      while (position.position < input.length && condition(input[position.position])) {
        result += input[position.position];
        position.position++;
      }
      return result;
    }
    __name(collectASequenceOfCodePoints, "collectASequenceOfCodePoints");
    function stringPercentDecode(input) {
      const bytes = encoder.encode(input);
      return percentDecode(bytes);
    }
    __name(stringPercentDecode, "stringPercentDecode");
    function percentDecode(input) {
      const output = [];
      for (let i = 0; i < input.length; i++) {
        const byte = input[i];
        if (byte !== 37) {
          output.push(byte);
        } else if (byte === 37 && !/^[0-9A-Fa-f]{2}$/i.test(String.fromCharCode(input[i + 1], input[i + 2]))) {
          output.push(37);
        } else {
          const nextTwoBytes = String.fromCharCode(input[i + 1], input[i + 2]);
          const bytePoint = Number.parseInt(nextTwoBytes, 16);
          output.push(bytePoint);
          i += 2;
        }
      }
      return Uint8Array.of(...output);
    }
    __name(percentDecode, "percentDecode");
    function parseMIMEType(input) {
      input = input.trim();
      const position = { position: 0 };
      const type = collectASequenceOfCodePoints((char) => char !== "/", input, position);
      if (type.length === 0 || !/^[!#$%&'*+-.^_|~A-z0-9]+$/.test(type)) {
        return "failure";
      }
      if (position.position > input.length) {
        return "failure";
      }
      position.position++;
      let subtype = collectASequenceOfCodePoints((char) => char !== ";", input, position);
      subtype = subtype.trim();
      if (subtype.length === 0 || !/^[!#$%&'*+-.^_|~A-z0-9]+$/.test(subtype)) {
        return "failure";
      }
      const mimeType = {
        type: type.toLowerCase(),
        subtype: subtype.toLowerCase(),
        parameters: /* @__PURE__ */ new Map()
      };
      while (position.position < input.length) {
        position.position++;
        collectASequenceOfCodePoints((char) => /(\u000A|\u000D|\u0009|\u0020)/.test(char), input, position);
        let parameterName = collectASequenceOfCodePoints((char) => char !== ";" && char !== "=", input, position);
        parameterName = parameterName.toLowerCase();
        if (position.position < input.length) {
          if (input[position.position] === ";") {
            continue;
          }
          position.position++;
        }
        if (position.position > input.length) {
          break;
        }
        let parameterValue = null;
        if (input[position.position] === '"') {
          parameterValue = collectAnHTTPQuotedString(input, position);
          collectASequenceOfCodePoints((char) => char !== ";", input, position);
        } else {
          parameterValue = collectASequenceOfCodePoints((char) => char !== ";", input, position);
          parameterValue = parameterValue.trim();
          if (parameterValue.length === 0) {
            continue;
          }
        }
        if (parameterName.length !== 0 && /^[!#$%&'*+-.^_|~A-z0-9]+$/.test(parameterName) && !/^(\u0009|\x{0020}-\x{007E}|\x{0080}-\x{00FF})+$/.test(parameterValue) && !mimeType.parameters.has(parameterName)) {
          mimeType.parameters.set(parameterName, parameterValue);
        }
      }
      return mimeType;
    }
    __name(parseMIMEType, "parseMIMEType");
    function forgivingBase64(data) {
      data = data.replace(/[\u0009\u000A\u000C\u000D\u0020]/g, "");
      if (data.length % 4 === 0) {
        data = data.replace(/=?=$/, "");
      }
      if (data.length % 4 === 1) {
        return "failure";
      }
      if (/[^+/0-9A-Za-z]/.test(data)) {
        return "failure";
      }
      const binary = atob2(data);
      const bytes = new Uint8Array(binary.length);
      for (let byte = 0; byte < binary.length; byte++) {
        bytes[byte] = binary.charCodeAt(byte);
      }
      return bytes;
    }
    __name(forgivingBase64, "forgivingBase64");
    function collectAnHTTPQuotedString(input, position, extractValue) {
      const positionStart = position.position;
      let value = "";
      assert(input[position.position] === '"');
      position.position++;
      while (true) {
        value += collectASequenceOfCodePoints((char) => char !== '"' && char !== "\\", input, position);
        if (position.position >= input.length) {
          break;
        }
        const quoteOrBackslash = input[position.position];
        position.position++;
        if (quoteOrBackslash === "\\") {
          if (position.position >= input.length) {
            value += "\\";
            break;
          }
          value += input[position.position];
          position.position++;
        } else {
          assert(quoteOrBackslash === '"');
          break;
        }
      }
      if (extractValue) {
        return value;
      }
      return input.slice(positionStart, position.position);
    }
    __name(collectAnHTTPQuotedString, "collectAnHTTPQuotedString");
    module2.exports = {
      dataURLProcessor,
      URLSerializer,
      collectASequenceOfCodePoints,
      stringPercentDecode,
      parseMIMEType,
      collectAnHTTPQuotedString
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/index.js
var require_fetch = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/fetch/index.js"(exports, module2) {
    "use strict";
    var {
      Response,
      makeNetworkError,
      makeAppropriateNetworkError,
      filterResponse,
      makeResponse
    } = require_response();
    var { Headers } = require_headers();
    var { Request, makeRequest } = require_request();
    var zlib = require("zlib");
    var {
      matchRequestIntegrity,
      makePolicyContainer,
      clonePolicyContainer,
      requestBadPort,
      TAOCheck,
      appendRequestOriginHeader,
      responseLocationURL,
      requestCurrentURL,
      setRequestReferrerPolicyOnRedirect,
      tryUpgradeRequestToAPotentiallyTrustworthyURL,
      createOpaqueTimingInfo,
      appendFetchMetadata,
      corsCheck,
      crossOriginResourcePolicyCheck,
      determineRequestsReferrer,
      coarsenedSharedCurrentTime,
      createDeferredPromise,
      isBlobLike,
      sameOrigin,
      isCancelled,
      isAborted
    } = require_util2();
    var { kState, kHeaders, kGuard, kRealm } = require_symbols2();
    var { AbortError } = require_errors();
    var assert = require("assert");
    var { safelyExtractBody, extractBody } = require_body();
    var {
      redirectStatus,
      nullBodyStatus,
      safeMethods,
      requestBodyHeader,
      subresource
    } = require_constants2();
    var { kHeadersList } = require_symbols();
    var EE = require("events");
    var { Readable, pipeline } = require("stream");
    var { isErrored, isReadable } = require_util();
    var { dataURLProcessor } = require_dataURL();
    var { TransformStream } = require_web_streams();
    var resolveObjectURL;
    var ReadableStream;
    var Fetch = class extends EE {
      constructor(dispatcher) {
        super();
        this.dispatcher = dispatcher;
        this.connection = null;
        this.dump = false;
        this.state = "ongoing";
      }
      terminate(reason) {
        var _a2;
        if (this.state !== "ongoing") {
          return;
        }
        this.state = "terminated";
        (_a2 = this.connection) == null ? void 0 : _a2.destroy(reason);
        this.emit("terminated", reason);
      }
      abort() {
        var _a2;
        if (this.state !== "ongoing") {
          return;
        }
        const reason = new AbortError();
        this.state = "aborted";
        (_a2 = this.connection) == null ? void 0 : _a2.destroy(reason);
        this.emit("terminated", reason);
      }
    };
    __name(Fetch, "Fetch");
    async function fetch(...args) {
      var _a2, _b;
      if (args.length < 1) {
        throw new TypeError(`Failed to execute 'fetch' on 'Window': 1 argument required, but only ${args.length} present.`);
      }
      if (args.length >= 1 && typeof args[1] !== "object" && args[1] !== void 0) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': cannot convert to dictionary.");
      }
      const resource = args[0];
      const init = args.length >= 1 ? (_a2 = args[1]) != null ? _a2 : {} : {};
      const p = createDeferredPromise();
      const requestObject = new Request(resource, init);
      const request = requestObject[kState];
      if (requestObject.signal.aborted) {
        abortFetch(p, request, null);
        return p.promise;
      }
      const globalObject = request.client.globalObject;
      if (((_b = globalObject == null ? void 0 : globalObject.constructor) == null ? void 0 : _b.name) === "ServiceWorkerGlobalScope") {
        request.serviceWorkers = "none";
      }
      let responseObject = null;
      const relevantRealm = null;
      let locallyAborted = false;
      let controller = null;
      requestObject.signal.addEventListener("abort", () => {
        locallyAborted = true;
        abortFetch(p, request, responseObject);
        if (controller != null) {
          controller.abort();
        }
      }, { once: true });
      const handleFetchDone = /* @__PURE__ */ __name((response) => finalizeAndReportTiming(response, "fetch"), "handleFetchDone");
      const processResponse = /* @__PURE__ */ __name((response) => {
        if (locallyAborted) {
          return;
        }
        if (response.aborted) {
          abortFetch(p, request, responseObject);
          return;
        }
        if (response.type === "error") {
          p.reject(Object.assign(new TypeError("fetch failed"), { cause: response.error }));
          return;
        }
        responseObject = new Response();
        responseObject[kState] = response;
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders][kHeadersList] = response.headersList;
        responseObject[kHeaders][kGuard] = "immutable";
        responseObject[kHeaders][kRealm] = relevantRealm;
        p.resolve(responseObject);
      }, "processResponse");
      controller = fetching({
        request,
        processResponseEndOfBody: handleFetchDone,
        processResponse,
        dispatcher: this
      });
      return p.promise;
    }
    __name(fetch, "fetch");
    function finalizeAndReportTiming(response, initiatorType = "other") {
      var _a2;
      if (response.type === "error" && response.aborted) {
        return;
      }
      if (!((_a2 = response.urlList) == null ? void 0 : _a2.length)) {
        return;
      }
      const originalURL = response.urlList[0];
      let timingInfo = response.timingInfo;
      let cacheState = response.cacheState;
      if (!/^https?:/.test(originalURL.protocol)) {
        return;
      }
      if (timingInfo === null) {
        return;
      }
      if (!timingInfo.timingAllowPassed) {
        timingInfo = createOpaqueTimingInfo({
          startTime: timingInfo.startTime
        });
        cacheState = "";
      }
      response.timingInfo.endTime = coarsenedSharedCurrentTime();
      response.timingInfo = timingInfo;
      markResourceTiming(timingInfo, originalURL, initiatorType, globalThis, cacheState);
    }
    __name(finalizeAndReportTiming, "finalizeAndReportTiming");
    function markResourceTiming() {
    }
    __name(markResourceTiming, "markResourceTiming");
    function abortFetch(p, request, responseObject) {
      var _a2, _b;
      const error = new AbortError();
      p.reject(error);
      if (request.body != null && isReadable((_a2 = request.body) == null ? void 0 : _a2.stream)) {
        request.body.stream.cancel(error).catch((err) => {
          if (err.code === "ERR_INVALID_STATE") {
            return;
          }
          throw err;
        });
      }
      if (responseObject == null) {
        return;
      }
      const response = responseObject[kState];
      if (response.body != null && isReadable((_b = response.body) == null ? void 0 : _b.stream)) {
        response.body.stream.cancel(error).catch((err) => {
          if (err.code === "ERR_INVALID_STATE") {
            return;
          }
          throw err;
        });
      }
    }
    __name(abortFetch, "abortFetch");
    function fetching({
      request,
      processRequestBodyChunkLength,
      processRequestEndOfBody,
      processResponse,
      processResponseEndOfBody,
      processResponseConsumeBody,
      useParallelQueue = false,
      dispatcher
    }) {
      var _a2, _b, _c, _d;
      let taskDestination = null;
      let crossOriginIsolatedCapability = false;
      if (request.client != null) {
        taskDestination = request.client.globalObject;
        crossOriginIsolatedCapability = request.client.crossOriginIsolatedCapability;
      }
      const currenTime = coarsenedSharedCurrentTime(crossOriginIsolatedCapability);
      const timingInfo = createOpaqueTimingInfo({
        startTime: currenTime
      });
      const fetchParams = {
        controller: new Fetch(dispatcher),
        request,
        timingInfo,
        processRequestBodyChunkLength,
        processRequestEndOfBody,
        processResponse,
        processResponseConsumeBody,
        processResponseEndOfBody,
        taskDestination,
        crossOriginIsolatedCapability
      };
      assert(!request.body || request.body.stream);
      if (request.window === "client") {
        request.window = ((_c = (_b = (_a2 = request.client) == null ? void 0 : _a2.globalObject) == null ? void 0 : _b.constructor) == null ? void 0 : _c.name) === "Window" ? request.client : "no-window";
      }
      if (request.origin === "client") {
        request.origin = (_d = request.client) == null ? void 0 : _d.origin;
      }
      if (request.policyContainer === "client") {
        if (request.client != null) {
          request.policyContainer = clonePolicyContainer(request.client.policyContainer);
        } else {
          request.policyContainer = makePolicyContainer();
        }
      }
      if (!request.headersList.has("accept")) {
        const value = "*/*";
        request.headersList.append("accept", value);
      }
      if (!request.headersList.has("accept-language")) {
        request.headersList.append("accept-language", "*");
      }
      if (request.priority === null) {
      }
      if (subresource.includes(request.destination)) {
      }
      mainFetch(fetchParams).catch((err) => {
        fetchParams.controller.terminate(err);
      });
      return fetchParams.controller;
    }
    __name(fetching, "fetching");
    async function mainFetch(fetchParams, recursive = false) {
      const request = fetchParams.request;
      let response = null;
      if (request.localURLsOnly && !/^(about|blob|data):/.test(requestCurrentURL(request).protocol)) {
        response = makeNetworkError("local URLs only");
      }
      tryUpgradeRequestToAPotentiallyTrustworthyURL(request);
      if (requestBadPort(request) === "blocked") {
        response = makeNetworkError("bad port");
      }
      if (request.referrerPolicy === "") {
        request.referrerPolicy = request.policyContainer.referrerPolicy;
      }
      if (request.referrer !== "no-referrer") {
        request.referrer = determineRequestsReferrer(request);
      }
      if (response === null) {
        response = await (async () => {
          const currentURL = requestCurrentURL(request);
          if (sameOrigin(currentURL, request.url) && request.responseTainting === "basic" || currentURL.protocol === "data:" || (request.mode === "navigate" || request.mode === "websocket")) {
            request.responseTainting = "basic";
            return await schemeFetch(fetchParams);
          }
          if (request.mode === "same-origin") {
            return makeNetworkError('request mode cannot be "same-origin"');
          }
          if (request.mode === "no-cors") {
            if (request.redirect !== "follow") {
              return makeNetworkError('redirect mode cannot be "follow" for "no-cors" request');
            }
            request.responseTainting = "opaque";
            return await schemeFetch(fetchParams);
          }
          if (!/^https?:/.test(requestCurrentURL(request).protocol)) {
            return makeNetworkError("URL scheme must be a HTTP(S) scheme");
          }
          request.responseTainting = "cors";
          return await httpFetch(fetchParams);
        })();
      }
      if (recursive) {
        return response;
      }
      if (response.status !== 0 && !response.internalResponse) {
        if (request.responseTainting === "cors") {
        }
        if (request.responseTainting === "basic") {
          response = filterResponse(response, "basic");
        } else if (request.responseTainting === "cors") {
          response = filterResponse(response, "cors");
        } else if (request.responseTainting === "opaque") {
          response = filterResponse(response, "opaque");
        } else {
          assert(false);
        }
      }
      let internalResponse = response.status === 0 ? response : response.internalResponse;
      if (internalResponse.urlList.length === 0) {
        internalResponse.urlList.push(...request.urlList);
      }
      if (!request.timingAllowFailed) {
        response.timingAllowPassed = true;
      }
      if (response.type === "opaque" && internalResponse.status === 206 && internalResponse.rangeRequested && !request.headers.has("range")) {
        response = internalResponse = makeNetworkError();
      }
      if (response.status !== 0 && (request.method === "HEAD" || request.method === "CONNECT" || nullBodyStatus.includes(internalResponse.status))) {
        internalResponse.body = null;
        fetchParams.controller.dump = true;
      }
      if (request.integrity) {
        const processBodyError = /* @__PURE__ */ __name((reason) => fetchFinale(fetchParams, makeNetworkError(reason)), "processBodyError");
        if (request.responseTainting === "opaque" || response.body == null) {
          processBodyError(response.error);
          return;
        }
        const processBody = /* @__PURE__ */ __name((bytes) => {
          if (!matchRequestIntegrity(request, bytes)) {
            processBodyError("integrity mismatch");
            return;
          }
          response.body = safelyExtractBody(bytes)[0];
          fetchFinale(fetchParams, response);
        }, "processBody");
        try {
          processBody(await response.arrayBuffer());
        } catch (err) {
          processBodyError(err);
        }
      } else {
        fetchFinale(fetchParams, response);
      }
    }
    __name(mainFetch, "mainFetch");
    async function schemeFetch(fetchParams) {
      const { request } = fetchParams;
      const {
        protocol: scheme,
        pathname: path
      } = requestCurrentURL(request);
      switch (scheme) {
        case "about:": {
          if (path === "blank") {
            const resp = makeResponse({
              statusText: "OK",
              headersList: [
                ["content-type", "text/html;charset=utf-8"]
              ]
            });
            resp.urlList = [new URL("about:blank")];
            return resp;
          }
          return makeNetworkError("invalid path called");
        }
        case "blob:": {
          resolveObjectURL = resolveObjectURL || require_buffer().resolveObjectURL;
          const currentURL = requestCurrentURL(request);
          if (currentURL.search.length !== 0) {
            return makeNetworkError("NetworkError when attempting to fetch resource.");
          }
          const blob = resolveObjectURL(currentURL.toString());
          if (request.method !== "GET" || !isBlobLike(blob)) {
            return makeNetworkError("invalid method");
          }
          const response = makeResponse({ statusText: "OK", urlList: [currentURL] });
          response.headersList.set("content-length", `${blob.size}`);
          response.headersList.set("content-type", blob.type);
          response.body = extractBody(blob)[0];
          return response;
        }
        case "data:": {
          const currentURL = requestCurrentURL(request);
          const dataURLStruct = dataURLProcessor(currentURL);
          if (dataURLStruct === "failure") {
            return makeNetworkError("failed to fetch the data URL");
          }
          const { mimeType } = dataURLStruct;
          let contentType = `${mimeType.type}/${mimeType.subtype}`;
          const contentTypeParams = [];
          if (mimeType.parameters.size > 0) {
            contentType += ";";
          }
          for (const [key, value] of mimeType.parameters) {
            if (value.length > 0) {
              contentTypeParams.push(`${key}=${value}`);
            } else {
              contentTypeParams.push(key);
            }
          }
          contentType += contentTypeParams.join(",");
          return makeResponse({
            statusText: "OK",
            headersList: [
              ["content-type", contentType]
            ],
            body: extractBody(dataURLStruct.body)[0]
          });
        }
        case "file:": {
          return makeNetworkError("not implemented... yet...");
        }
        case "http:":
        case "https:": {
          return await httpFetch(fetchParams).catch((err) => makeNetworkError(err));
        }
        default: {
          return makeNetworkError("unknown scheme");
        }
      }
    }
    __name(schemeFetch, "schemeFetch");
    function finalizeResponse(fetchParams, response) {
      fetchParams.request.done = true;
      if (fetchParams.processResponseDone != null) {
        queueMicrotask(() => fetchParams.processResponseDone(response));
      }
    }
    __name(finalizeResponse, "finalizeResponse");
    async function fetchFinale(fetchParams, response) {
      if (response.type === "error") {
        response.urlList = [fetchParams.request.urlList[0]];
        response.timingInfo = createOpaqueTimingInfo({
          startTime: fetchParams.timingInfo.startTime
        });
      }
      const processResponseEndOfBody = /* @__PURE__ */ __name(() => {
        fetchParams.request.done = true;
        if (fetchParams.processResponseEndOfBody != null) {
          queueMicrotask(() => fetchParams.processResponseEndOfBody(response));
        }
      }, "processResponseEndOfBody");
      if (fetchParams.processResponse != null) {
        queueMicrotask(() => fetchParams.processResponse(response));
      }
      if (response.body == null) {
        processResponseEndOfBody();
      } else {
        const identityTransformAlgorithm = /* @__PURE__ */ __name((chunk, controller) => {
          controller.enqueue(chunk);
        }, "identityTransformAlgorithm");
        const transformStream = new TransformStream({
          start() {
          },
          transform: identityTransformAlgorithm,
          flush: processResponseEndOfBody
        });
        response.body = { stream: response.body.stream.pipeThrough(transformStream) };
      }
      if (fetchParams.processResponseConsumeBody != null) {
        const processBody = /* @__PURE__ */ __name((nullOrBytes) => fetchParams.processResponseConsumeBody(response, nullOrBytes), "processBody");
        const processBodyError = /* @__PURE__ */ __name((failure) => fetchParams.processResponseConsumeBody(response, failure), "processBodyError");
        if (response.body == null) {
          queueMicrotask(() => processBody(null));
        } else {
          try {
            processBody(await response.body.stream.arrayBuffer());
          } catch (err) {
            processBodyError(err);
          }
        }
      }
    }
    __name(fetchFinale, "fetchFinale");
    async function httpFetch(fetchParams) {
      const request = fetchParams.request;
      let response = null;
      let actualResponse = null;
      const timingInfo = fetchParams.timingInfo;
      if (request.serviceWorkers === "all") {
      }
      if (response === null) {
        if (request.redirect === "follow") {
          request.serviceWorkers = "none";
        }
        actualResponse = response = await httpNetworkOrCacheFetch(fetchParams);
        if (request.responseTainting === "cors" && corsCheck(request, response) === "failure") {
          return makeNetworkError("cors failure");
        }
        if (TAOCheck(request, response) === "failure") {
          request.timingAllowFailed = true;
        }
      }
      if ((request.responseTainting === "opaque" || response.type === "opaque") && crossOriginResourcePolicyCheck(request.origin, request.client, request.destination, actualResponse) === "blocked") {
        return makeNetworkError("blocked");
      }
      if (redirectStatus.includes(actualResponse.status)) {
        fetchParams.controller.connection.destroy();
        if (request.redirect === "error") {
          response = makeNetworkError();
        } else if (request.redirect === "manual") {
          response = actualResponse;
        } else if (request.redirect === "follow") {
          response = await httpRedirectFetch(fetchParams, response);
        } else {
          assert(false);
        }
      }
      response.timingInfo = timingInfo;
      return response;
    }
    __name(httpFetch, "httpFetch");
    async function httpRedirectFetch(fetchParams, response) {
      const request = fetchParams.request;
      const actualResponse = response.internalResponse ? response.internalResponse : response;
      let locationURL;
      try {
        locationURL = responseLocationURL(actualResponse, requestCurrentURL(request).hash);
        if (locationURL == null) {
          return response;
        }
      } catch (err) {
        return makeNetworkError(err);
      }
      if (!/^https?:/.test(locationURL.protocol)) {
        return makeNetworkError("URL scheme must be a HTTP(S) scheme");
      }
      if (request.redirectCount === 20) {
        return makeNetworkError("redirect count exceeded");
      }
      request.redirectCount += 1;
      if (request.mode === "cors" && (locationURL.username || locationURL.password) && !sameOrigin(request, locationURL)) {
        return makeNetworkError('cross origin not allowed for request mode "cors"');
      }
      if (request.responseTainting === "cors" && (locationURL.username || locationURL.password)) {
        return makeNetworkError('URL cannot contain credentials for request mode "cors"');
      }
      if (actualResponse.status !== 303 && request.body != null && request.body.source == null) {
        return makeNetworkError();
      }
      if ([301, 302].includes(actualResponse.status) && request.method === "POST" || actualResponse.status === 303 && !["GET", "HEAD"].includes(request.method)) {
        request.method = "GET";
        request.body = null;
        for (const headerName of requestBodyHeader) {
          request.headersList.delete(headerName);
        }
      }
      if (request.body != null) {
        assert(request.body.source);
        request.body = safelyExtractBody(request.body.source)[0];
      }
      const timingInfo = fetchParams.timingInfo;
      timingInfo.redirectEndTime = timingInfo.postRedirectStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
      if (timingInfo.redirectStartTime === 0) {
        timingInfo.redirectStartTime = timingInfo.startTime;
      }
      request.urlList.push(locationURL);
      setRequestReferrerPolicyOnRedirect(request, actualResponse);
      return mainFetch(fetchParams, true);
    }
    __name(httpRedirectFetch, "httpRedirectFetch");
    async function httpNetworkOrCacheFetch(fetchParams, isAuthenticationFetch = false, isNewConnectionFetch = false) {
      const request = fetchParams.request;
      let httpFetchParams = null;
      let httpRequest = null;
      let response = null;
      const httpCache = null;
      const revalidatingFlag = false;
      if (request.window === "no-window" && request.redirect === "error") {
        httpFetchParams = fetchParams;
        httpRequest = request;
      } else {
        httpRequest = makeRequest(request);
        httpFetchParams = { ...fetchParams };
        httpFetchParams.request = httpRequest;
      }
      const includeCredentials = request.credentials === "include" || request.credentials === "same-origin" && request.responseTainting === "basic";
      const contentLength = httpRequest.body ? httpRequest.body.length : null;
      let contentLengthHeaderValue = null;
      if (httpRequest.body == null && ["POST", "PUT"].includes(httpRequest.method)) {
        contentLengthHeaderValue = "0";
      }
      if (contentLength != null) {
        contentLengthHeaderValue = String(contentLength);
      }
      if (contentLengthHeaderValue != null) {
        httpRequest.headersList.append("content-length", contentLengthHeaderValue);
      }
      if (contentLength != null && httpRequest.keepalive) {
      }
      if (httpRequest.referrer instanceof URL) {
        httpRequest.headersList.append("referer", httpRequest.referrer.href);
      }
      appendRequestOriginHeader(httpRequest);
      appendFetchMetadata(httpRequest);
      if (!httpRequest.headersList.has("user-agent")) {
        httpRequest.headersList.append("user-agent", "undici");
      }
      if (httpRequest.cache === "default" && (httpRequest.headersList.has("if-modified-since") || httpRequest.headersList.has("if-none-match") || httpRequest.headersList.has("if-unmodified-since") || httpRequest.headersList.has("if-match") || httpRequest.headersList.has("if-range"))) {
        httpRequest.cache = "no-store";
      }
      if (httpRequest.cache === "no-cache" && !httpRequest.preventNoCacheCacheControlHeaderModification && !httpRequest.headersList.has("cache-control")) {
        httpRequest.headersList.append("cache-control", "max-age=0");
      }
      if (httpRequest.cache === "no-store" || httpRequest.cache === "reload") {
        if (!httpRequest.headersList.has("pragma")) {
          httpRequest.headersList.append("pragma", "no-cache");
        }
        if (!httpRequest.headersList.has("cache-control")) {
          httpRequest.headersList.append("cache-control", "no-cache");
        }
      }
      if (httpRequest.headersList.has("range")) {
        httpRequest.headersList.append("accept-encoding", "identity");
      }
      if (!httpRequest.headersList.has("accept-encoding")) {
        if (/^https:/.test(requestCurrentURL(httpRequest).protocol)) {
          httpRequest.headersList.append("accept-encoding", "br, gzip, deflate");
        } else {
          httpRequest.headersList.append("accept-encoding", "gzip, deflate");
        }
      }
      if (includeCredentials) {
      }
      if (httpCache == null) {
        httpRequest.cache = "no-store";
      }
      if (httpRequest.mode !== "no-store" && httpRequest.mode !== "reload") {
      }
      if (response == null) {
        if (httpRequest.mode === "only-if-cached") {
          return makeNetworkError("only if cached");
        }
        const forwardResponse = await httpNetworkFetch(httpFetchParams, includeCredentials, isNewConnectionFetch);
        if (!safeMethods.includes(httpRequest.method) && forwardResponse.status >= 200 && forwardResponse.status <= 399) {
        }
        if (revalidatingFlag && forwardResponse.status === 304) {
        }
        if (response == null) {
          response = forwardResponse;
        }
      }
      response.urlList = [...httpRequest.urlList];
      if (httpRequest.headersList.has("range")) {
        response.rangeRequested = true;
      }
      response.requestIncludesCredentials = includeCredentials;
      if (response.status === 407) {
        if (request.window === "no-window") {
          return makeNetworkError();
        }
        if (isCancelled(fetchParams)) {
          return makeAppropriateNetworkError(fetchParams);
        }
        return makeNetworkError("proxy authentication required");
      }
      if (response.status === 421 && !isNewConnectionFetch && (request.body == null || request.body.source != null)) {
        if (isCancelled(fetchParams)) {
          return makeAppropriateNetworkError(fetchParams);
        }
        fetchParams.controller.connection.destroy();
        response = await httpNetworkOrCacheFetch(fetchParams, isAuthenticationFetch, true);
      }
      if (isAuthenticationFetch) {
      }
      return response;
    }
    __name(httpNetworkOrCacheFetch, "httpNetworkOrCacheFetch");
    async function httpNetworkFetch(fetchParams, includeCredentials = false, forceNewConnection = false) {
      assert(!fetchParams.controller.connection || fetchParams.controller.connection.destroyed);
      fetchParams.controller.connection = {
        abort: null,
        destroyed: false,
        destroy(err) {
          var _a2;
          if (!this.destroyed) {
            this.destroyed = true;
            (_a2 = this.abort) == null ? void 0 : _a2.call(this, err != null ? err : new AbortError());
          }
        }
      };
      const request = fetchParams.request;
      let response = null;
      const timingInfo = fetchParams.timingInfo;
      const httpCache = null;
      if (httpCache == null) {
        request.cache = "no-store";
      }
      const newConnection = forceNewConnection ? "yes" : "no";
      if (request.mode === "websocket") {
      } else {
      }
      let requestBody = null;
      if (request.body == null && fetchParams.processRequestEndOfBody) {
        queueMicrotask(() => fetchParams.processRequestEndOfBody());
      } else if (request.body != null) {
        const processBodyChunk = /* @__PURE__ */ __name(async function* (bytes) {
          var _a2;
          if (isCancelled(fetchParams)) {
            return;
          }
          yield bytes;
          (_a2 = fetchParams.processRequestBodyChunkLength) == null ? void 0 : _a2.call(fetchParams, bytes.byteLength);
        }, "processBodyChunk");
        const processEndOfBody = /* @__PURE__ */ __name(() => {
          if (isCancelled(fetchParams)) {
            return;
          }
          if (fetchParams.processRequestEndOfBody) {
            fetchParams.processRequestEndOfBody();
          }
        }, "processEndOfBody");
        const processBodyError = /* @__PURE__ */ __name((e) => {
          if (isCancelled(fetchParams)) {
            return;
          }
          if (e.name === "AbortError") {
            fetchParams.controller.abort();
          } else {
            fetchParams.controller.terminate(e);
          }
        }, "processBodyError");
        requestBody = async function* () {
          try {
            for await (const bytes of request.body.stream) {
              yield* processBodyChunk(bytes);
            }
            processEndOfBody();
          } catch (err) {
            processBodyError(err);
          }
        }();
      }
      try {
        const { body, status, statusText, headersList } = await dispatch({ body: requestBody });
        const iterator = body[Symbol.asyncIterator]();
        fetchParams.controller.next = () => iterator.next();
        response = makeResponse({ status, statusText, headersList });
      } catch (err) {
        if (err.name === "AbortError") {
          fetchParams.controller.connection.destroy();
          return makeAppropriateNetworkError(fetchParams);
        }
        return makeNetworkError(err);
      }
      const pullAlgorithm = /* @__PURE__ */ __name(() => {
        fetchParams.controller.resume();
      }, "pullAlgorithm");
      const cancelAlgorithm = /* @__PURE__ */ __name(() => {
        fetchParams.controller.abort();
      }, "cancelAlgorithm");
      if (!ReadableStream) {
        ReadableStream = require_web_streams().ReadableStream;
      }
      const stream = new ReadableStream({
        async start(controller) {
          fetchParams.controller.controller = controller;
        },
        async pull(controller) {
          await pullAlgorithm(controller);
        },
        async cancel(reason) {
          await cancelAlgorithm(reason);
        }
      }, { highWaterMark: 0 });
      response.body = { stream };
      fetchParams.controller.on("terminated", onAborted);
      fetchParams.controller.resume = async () => {
        var _a2;
        while (true) {
          let bytes;
          try {
            const { done, value } = await fetchParams.controller.next();
            if (isAborted(fetchParams)) {
              break;
            }
            bytes = done ? void 0 : value;
          } catch (err) {
            if (fetchParams.controller.ended && !timingInfo.encodedBodySize) {
              bytes = void 0;
            } else {
              bytes = err;
            }
          }
          if (bytes === void 0) {
            try {
              fetchParams.controller.controller.close();
            } catch (err) {
              if (!/Controller is already closed/.test(err)) {
                throw err;
              }
            }
            finalizeResponse(fetchParams, response);
            return;
          }
          timingInfo.decodedBodySize += (_a2 = bytes == null ? void 0 : bytes.byteLength) != null ? _a2 : 0;
          if (bytes instanceof Error) {
            fetchParams.controller.terminate(bytes);
            return;
          }
          fetchParams.controller.controller.enqueue(new Uint8Array(bytes));
          if (isErrored(stream)) {
            fetchParams.controller.terminate();
            return;
          }
          if (!fetchParams.controller.controller.desiredSize) {
            return;
          }
        }
      };
      function onAborted(reason) {
        if (isAborted(fetchParams)) {
          response.aborted = true;
          if (isReadable(stream)) {
            fetchParams.controller.controller.error(new AbortError());
          }
        } else {
          if (isReadable(stream)) {
            fetchParams.controller.controller.error(new TypeError("terminated", {
              cause: reason instanceof Error ? reason : void 0
            }));
          }
        }
        fetchParams.controller.connection.destroy();
      }
      __name(onAborted, "onAborted");
      return response;
      async function dispatch({ body }) {
        const url = requestCurrentURL(request);
        return new Promise((resolve, reject) => fetchParams.controller.dispatcher.dispatch({
          path: url.pathname + url.search,
          origin: url.origin,
          method: request.method,
          body: fetchParams.controller.dispatcher.isMockActive ? request.body && request.body.source : body,
          headers: [...request.headersList].flat(),
          maxRedirections: 0,
          bodyTimeout: 3e5,
          headersTimeout: 3e5
        }, {
          body: null,
          abort: null,
          onConnect(abort) {
            const { connection } = fetchParams.controller;
            if (connection.destroyed) {
              abort(new AbortError());
            } else {
              fetchParams.controller.on("terminated", abort);
              this.abort = connection.abort = abort;
            }
          },
          onHeaders(status, headersList, resume, statusText) {
            if (status < 200) {
              return;
            }
            let codings = [];
            const headers = new Headers();
            for (let n = 0; n < headersList.length; n += 2) {
              const key = headersList[n + 0].toString();
              const val = headersList[n + 1].toString();
              if (key.toLowerCase() === "content-encoding") {
                codings = val.split(",").map((x) => x.trim());
              }
              headers.append(key, val);
            }
            this.body = new Readable({ read: resume });
            const decoders = [];
            if (request.method !== "HEAD" && request.method !== "CONNECT" && !nullBodyStatus.includes(status)) {
              for (const coding of codings) {
                if (/(x-)?gzip/.test(coding)) {
                  decoders.push(zlib.createGunzip());
                } else if (/(x-)?deflate/.test(coding)) {
                  decoders.push(zlib.createInflate());
                } else if (coding === "br") {
                  decoders.push(zlib.createBrotliDecompress());
                } else {
                  decoders.length = 0;
                  break;
                }
              }
            }
            resolve({
              status,
              statusText,
              headersList: headers[kHeadersList],
              body: decoders.length ? pipeline(this.body, ...decoders, () => {
              }) : this.body.on("error", () => {
              })
            });
            return true;
          },
          onData(chunk) {
            if (fetchParams.controller.dump) {
              return;
            }
            const bytes = chunk;
            timingInfo.encodedBodySize += bytes.byteLength;
            return this.body.push(bytes);
          },
          onComplete() {
            if (this.abort) {
              fetchParams.controller.off("terminated", this.abort);
            }
            fetchParams.controller.ended = true;
            this.body.push(null);
          },
          onError(error) {
            var _a2;
            if (this.abort) {
              fetchParams.controller.off("terminated", this.abort);
            }
            (_a2 = this.body) == null ? void 0 : _a2.destroy(error);
            fetchParams.controller.terminate(error);
            reject(error);
          }
        }));
      }
      __name(dispatch, "dispatch");
    }
    __name(httpNetworkFetch, "httpNetworkFetch");
    module2.exports = fetch;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/dispatcher.js
var require_dispatcher = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/dispatcher.js"(exports, module2) {
    "use strict";
    var EventEmitter = require("events");
    var Dispatcher = class extends EventEmitter {
      dispatch() {
        throw new Error("not implemented");
      }
      close() {
        throw new Error("not implemented");
      }
      destroy() {
        throw new Error("not implemented");
      }
    };
    __name(Dispatcher, "Dispatcher");
    module2.exports = Dispatcher;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/dispatcher-base.js
var require_dispatcher_base = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/dispatcher-base.js"(exports, module2) {
    "use strict";
    var Dispatcher = require_dispatcher();
    var {
      ClientDestroyedError,
      ClientClosedError,
      InvalidArgumentError: InvalidArgumentError2
    } = require_errors();
    var { kDestroy, kClose, kDispatch } = require_symbols();
    var kDestroyed = Symbol("destroyed");
    var kClosed = Symbol("closed");
    var kOnDestroyed = Symbol("onDestroyed");
    var kOnClosed = Symbol("onClosed");
    var DispatcherBase = class extends Dispatcher {
      constructor() {
        super();
        this[kDestroyed] = false;
        this[kOnDestroyed] = [];
        this[kClosed] = false;
        this[kOnClosed] = [];
      }
      get destroyed() {
        return this[kDestroyed];
      }
      get closed() {
        return this[kClosed];
      }
      close(callback) {
        if (callback === void 0) {
          return new Promise((resolve, reject) => {
            this.close((err, data) => {
              return err ? reject(err) : resolve(data);
            });
          });
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError2("invalid callback");
        }
        if (this[kDestroyed]) {
          queueMicrotask(() => callback(new ClientDestroyedError(), null));
          return;
        }
        if (this[kClosed]) {
          if (this[kOnClosed]) {
            this[kOnClosed].push(callback);
          } else {
            queueMicrotask(() => callback(null, null));
          }
          return;
        }
        this[kClosed] = true;
        this[kOnClosed].push(callback);
        const onClosed = /* @__PURE__ */ __name(() => {
          const callbacks = this[kOnClosed];
          this[kOnClosed] = null;
          for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](null, null);
          }
        }, "onClosed");
        this[kClose]().then(() => this.destroy()).then(() => {
          queueMicrotask(onClosed);
        });
      }
      destroy(err, callback) {
        if (typeof err === "function") {
          callback = err;
          err = null;
        }
        if (callback === void 0) {
          return new Promise((resolve, reject) => {
            this.destroy(err, (err2, data) => {
              return err2 ? reject(err2) : resolve(data);
            });
          });
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError2("invalid callback");
        }
        if (this[kDestroyed]) {
          if (this[kOnDestroyed]) {
            this[kOnDestroyed].push(callback);
          } else {
            queueMicrotask(() => callback(null, null));
          }
          return;
        }
        if (!err) {
          err = new ClientDestroyedError();
        }
        this[kDestroyed] = true;
        this[kOnDestroyed].push(callback);
        const onDestroyed = /* @__PURE__ */ __name(() => {
          const callbacks = this[kOnDestroyed];
          this[kOnDestroyed] = null;
          for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](null, null);
          }
        }, "onDestroyed");
        this[kDestroy](err).then(() => {
          queueMicrotask(onDestroyed);
        });
      }
      dispatch(opts, handler) {
        if (!handler || typeof handler !== "object") {
          throw new InvalidArgumentError2("handler must be an object");
        }
        try {
          if (!opts || typeof opts !== "object") {
            throw new InvalidArgumentError2("opts must be an object.");
          }
          if (this[kDestroyed]) {
            throw new ClientDestroyedError();
          }
          if (this[kClosed]) {
            throw new ClientClosedError();
          }
          return this[kDispatch](opts, handler);
        } catch (err) {
          if (typeof handler.onError !== "function") {
            throw new InvalidArgumentError2("invalid onError method");
          }
          handler.onError(err);
          return false;
        }
      }
    };
    __name(DispatcherBase, "DispatcherBase");
    module2.exports = DispatcherBase;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/node/fixed-queue.js
var require_fixed_queue = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/node/fixed-queue.js"(exports, module2) {
    "use strict";
    var kSize = 2048;
    var kMask = kSize - 1;
    var FixedCircularBuffer = class {
      constructor() {
        this.bottom = 0;
        this.top = 0;
        this.list = new Array(kSize);
        this.next = null;
      }
      isEmpty() {
        return this.top === this.bottom;
      }
      isFull() {
        return (this.top + 1 & kMask) === this.bottom;
      }
      push(data) {
        this.list[this.top] = data;
        this.top = this.top + 1 & kMask;
      }
      shift() {
        const nextItem = this.list[this.bottom];
        if (nextItem === void 0)
          return null;
        this.list[this.bottom] = void 0;
        this.bottom = this.bottom + 1 & kMask;
        return nextItem;
      }
    };
    __name(FixedCircularBuffer, "FixedCircularBuffer");
    module2.exports = /* @__PURE__ */ __name(class FixedQueue {
      constructor() {
        this.head = this.tail = new FixedCircularBuffer();
      }
      isEmpty() {
        return this.head.isEmpty();
      }
      push(data) {
        if (this.head.isFull()) {
          this.head = this.head.next = new FixedCircularBuffer();
        }
        this.head.push(data);
      }
      shift() {
        const tail = this.tail;
        const next = tail.shift();
        if (tail.isEmpty() && tail.next !== null) {
          this.tail = tail.next;
        }
        return next;
      }
    }, "FixedQueue");
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/pool-stats.js
var require_pool_stats = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/pool-stats.js"(exports, module2) {
    var { kFree, kConnected, kPending, kQueued, kRunning, kSize } = require_symbols();
    var kPool = Symbol("pool");
    var PoolStats = class {
      constructor(pool) {
        this[kPool] = pool;
      }
      get connected() {
        return this[kPool][kConnected];
      }
      get free() {
        return this[kPool][kFree];
      }
      get pending() {
        return this[kPool][kPending];
      }
      get queued() {
        return this[kPool][kQueued];
      }
      get running() {
        return this[kPool][kRunning];
      }
      get size() {
        return this[kPool][kSize];
      }
    };
    __name(PoolStats, "PoolStats");
    module2.exports = PoolStats;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/pool-base.js
var require_pool_base = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/pool-base.js"(exports, module2) {
    "use strict";
    var DispatcherBase = require_dispatcher_base();
    var FixedQueue = require_fixed_queue();
    var { kConnected, kSize, kRunning, kPending, kQueued, kBusy, kFree, kUrl, kClose, kDestroy, kDispatch } = require_symbols();
    var PoolStats = require_pool_stats();
    var kClients = Symbol("clients");
    var kNeedDrain = Symbol("needDrain");
    var kQueue = Symbol("queue");
    var kClosedResolve = Symbol("closed resolve");
    var kOnDrain = Symbol("onDrain");
    var kOnConnect = Symbol("onConnect");
    var kOnDisconnect = Symbol("onDisconnect");
    var kOnConnectionError = Symbol("onConnectionError");
    var kGetDispatcher = Symbol("get dispatcher");
    var kAddClient = Symbol("add client");
    var kRemoveClient = Symbol("remove client");
    var kStats = Symbol("stats");
    var PoolBase = class extends DispatcherBase {
      constructor() {
        super();
        this[kQueue] = new FixedQueue();
        this[kClients] = [];
        this[kQueued] = 0;
        const pool = this;
        this[kOnDrain] = /* @__PURE__ */ __name(function onDrain(origin, targets) {
          const queue = pool[kQueue];
          let needDrain = false;
          while (!needDrain) {
            const item = queue.shift();
            if (!item) {
              break;
            }
            pool[kQueued]--;
            needDrain = !this.dispatch(item.opts, item.handler);
          }
          this[kNeedDrain] = needDrain;
          if (!this[kNeedDrain] && pool[kNeedDrain]) {
            pool[kNeedDrain] = false;
            pool.emit("drain", origin, [pool, ...targets]);
          }
          if (pool[kClosedResolve] && queue.isEmpty()) {
            Promise.all(pool[kClients].map((c) => c.close())).then(pool[kClosedResolve]);
          }
        }, "onDrain");
        this[kOnConnect] = (origin, targets) => {
          pool.emit("connect", origin, [pool, ...targets]);
        };
        this[kOnDisconnect] = (origin, targets, err) => {
          pool.emit("disconnect", origin, [pool, ...targets], err);
        };
        this[kOnConnectionError] = (origin, targets, err) => {
          pool.emit("connectionError", origin, [pool, ...targets], err);
        };
        this[kStats] = new PoolStats(this);
      }
      get [kBusy]() {
        return this[kNeedDrain];
      }
      get [kConnected]() {
        return this[kClients].filter((client) => client[kConnected]).length;
      }
      get [kFree]() {
        return this[kClients].filter((client) => client[kConnected] && !client[kNeedDrain]).length;
      }
      get [kPending]() {
        let ret = this[kQueued];
        for (const { [kPending]: pending } of this[kClients]) {
          ret += pending;
        }
        return ret;
      }
      get [kRunning]() {
        let ret = 0;
        for (const { [kRunning]: running } of this[kClients]) {
          ret += running;
        }
        return ret;
      }
      get [kSize]() {
        let ret = this[kQueued];
        for (const { [kSize]: size } of this[kClients]) {
          ret += size;
        }
        return ret;
      }
      get stats() {
        return this[kStats];
      }
      async [kClose]() {
        if (this[kQueue].isEmpty()) {
          return Promise.all(this[kClients].map((c) => c.close()));
        } else {
          return new Promise((resolve) => {
            this[kClosedResolve] = resolve;
          });
        }
      }
      async [kDestroy](err) {
        while (true) {
          const item = this[kQueue].shift();
          if (!item) {
            break;
          }
          item.handler.onError(err);
        }
        return Promise.all(this[kClients].map((c) => c.destroy(err)));
      }
      [kDispatch](opts, handler) {
        const dispatcher = this[kGetDispatcher]();
        if (!dispatcher) {
          this[kNeedDrain] = true;
          this[kQueue].push({ opts, handler });
          this[kQueued]++;
        } else if (!dispatcher.dispatch(opts, handler)) {
          dispatcher[kNeedDrain] = true;
          this[kNeedDrain] = !this[kGetDispatcher]();
        }
        return !this[kNeedDrain];
      }
      [kAddClient](client) {
        client.on("drain", this[kOnDrain]).on("connect", this[kOnConnect]).on("disconnect", this[kOnDisconnect]).on("connectionError", this[kOnConnectionError]);
        this[kClients].push(client);
        if (this[kNeedDrain]) {
          process.nextTick(() => {
            if (this[kNeedDrain]) {
              this[kOnDrain](client[kUrl], [this, client]);
            }
          });
        }
        return this;
      }
      [kRemoveClient](client) {
        client.close(() => {
          const idx = this[kClients].indexOf(client);
          if (idx !== -1) {
            this[kClients].splice(idx, 1);
          }
        });
        this[kNeedDrain] = this[kClients].some((dispatcher) => !dispatcher[kNeedDrain] && dispatcher.closed !== true && dispatcher.destroyed !== true);
      }
    };
    __name(PoolBase, "PoolBase");
    module2.exports = {
      PoolBase,
      kClients,
      kNeedDrain,
      kAddClient,
      kRemoveClient,
      kGetDispatcher
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/request.js
var require_request2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/request.js"(exports, module2) {
    "use strict";
    var {
      InvalidArgumentError: InvalidArgumentError2,
      NotSupportedError
    } = require_errors();
    var assert = require("assert");
    var util = require_util();
    var kHandler = Symbol("handler");
    var channels = {};
    var extractBody;
    var nodeVersion = process.versions.node.split(".");
    var nodeMajor = Number(nodeVersion[0]);
    var nodeMinor = Number(nodeVersion[1]);
    try {
      const diagnosticsChannel = require("diagnostics_channel");
      channels.create = diagnosticsChannel.channel("undici:request:create");
      channels.bodySent = diagnosticsChannel.channel("undici:request:bodySent");
      channels.headers = diagnosticsChannel.channel("undici:request:headers");
      channels.trailers = diagnosticsChannel.channel("undici:request:trailers");
      channels.error = diagnosticsChannel.channel("undici:request:error");
    } catch {
      channels.create = { hasSubscribers: false };
      channels.bodySent = { hasSubscribers: false };
      channels.headers = { hasSubscribers: false };
      channels.trailers = { hasSubscribers: false };
      channels.error = { hasSubscribers: false };
    }
    var Request = class {
      constructor(origin, {
        path,
        method,
        body,
        headers,
        query,
        idempotent,
        blocking,
        upgrade,
        headersTimeout,
        bodyTimeout,
        throwOnError
      }, handler) {
        if (typeof path !== "string") {
          throw new InvalidArgumentError2("path must be a string");
        } else if (path[0] !== "/" && !(path.startsWith("http://") || path.startsWith("https://")) && method !== "CONNECT") {
          throw new InvalidArgumentError2("path must be an absolute URL or start with a slash");
        }
        if (typeof method !== "string") {
          throw new InvalidArgumentError2("method must be a string");
        }
        if (upgrade && typeof upgrade !== "string") {
          throw new InvalidArgumentError2("upgrade must be a string");
        }
        if (headersTimeout != null && (!Number.isFinite(headersTimeout) || headersTimeout < 0)) {
          throw new InvalidArgumentError2("invalid headersTimeout");
        }
        if (bodyTimeout != null && (!Number.isFinite(bodyTimeout) || bodyTimeout < 0)) {
          throw new InvalidArgumentError2("invalid bodyTimeout");
        }
        this.headersTimeout = headersTimeout;
        this.bodyTimeout = bodyTimeout;
        this.throwOnError = throwOnError === true;
        this.method = method;
        if (body == null) {
          this.body = null;
        } else if (util.isStream(body)) {
          this.body = body;
        } else if (util.isBuffer(body)) {
          this.body = body.byteLength ? body : null;
        } else if (ArrayBuffer.isView(body)) {
          this.body = body.buffer.byteLength ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null;
        } else if (body instanceof ArrayBuffer) {
          this.body = body.byteLength ? Buffer.from(body) : null;
        } else if (typeof body === "string") {
          this.body = body.length ? Buffer.from(body) : null;
        } else if (util.isFormDataLike(body) || util.isIterable(body) || util.isBlobLike(body)) {
          this.body = body;
        } else {
          throw new InvalidArgumentError2("body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable");
        }
        this.completed = false;
        this.aborted = false;
        this.upgrade = upgrade || null;
        this.path = query ? util.buildURL(path, query) : path;
        this.origin = origin;
        this.idempotent = idempotent == null ? method === "HEAD" || method === "GET" : idempotent;
        this.blocking = blocking == null ? false : blocking;
        this.host = null;
        this.contentLength = null;
        this.contentType = null;
        this.headers = "";
        if (Array.isArray(headers)) {
          if (headers.length % 2 !== 0) {
            throw new InvalidArgumentError2("headers array must be even");
          }
          for (let i = 0; i < headers.length; i += 2) {
            processHeader(this, headers[i], headers[i + 1]);
          }
        } else if (headers && typeof headers === "object") {
          const keys = Object.keys(headers);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            processHeader(this, key, headers[key]);
          }
        } else if (headers != null) {
          throw new InvalidArgumentError2("headers must be an object or an array");
        }
        if (util.isFormDataLike(this.body)) {
          if (nodeMajor < 16 || nodeMajor === 16 && nodeMinor < 5) {
            throw new InvalidArgumentError2("Form-Data bodies are only supported in node v16.5 and newer.");
          }
          if (!extractBody) {
            extractBody = require_body().extractBody;
          }
          const [bodyStream, contentType] = extractBody(body);
          if (this.contentType == null) {
            this.contentType = contentType;
            this.headers += `content-type: ${contentType}\r
`;
          }
          this.body = bodyStream.stream;
        } else if (util.isBlobLike(body) && this.contentType == null && body.type) {
          this.contentType = body.type;
          this.headers += `content-type: ${body.type}\r
`;
        }
        util.validateHandler(handler, method, upgrade);
        this.servername = util.getServerName(this.host);
        this[kHandler] = handler;
        if (channels.create.hasSubscribers) {
          channels.create.publish({ request: this });
        }
      }
      onBodySent(chunk) {
        if (this[kHandler].onBodySent) {
          try {
            this[kHandler].onBodySent(chunk);
          } catch (err) {
            this.onError(err);
          }
        }
      }
      onRequestSent() {
        if (channels.bodySent.hasSubscribers) {
          channels.bodySent.publish({ request: this });
        }
      }
      onConnect(abort) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onConnect(abort);
      }
      onHeaders(statusCode, headers, resume, statusText) {
        assert(!this.aborted);
        assert(!this.completed);
        if (channels.headers.hasSubscribers) {
          channels.headers.publish({ request: this, response: { statusCode, headers, statusText } });
        }
        return this[kHandler].onHeaders(statusCode, headers, resume, statusText);
      }
      onData(chunk) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onData(chunk);
      }
      onUpgrade(statusCode, headers, socket) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onUpgrade(statusCode, headers, socket);
      }
      onComplete(trailers) {
        assert(!this.aborted);
        this.completed = true;
        if (channels.trailers.hasSubscribers) {
          channels.trailers.publish({ request: this, trailers });
        }
        return this[kHandler].onComplete(trailers);
      }
      onError(error) {
        if (channels.error.hasSubscribers) {
          channels.error.publish({ request: this, error });
        }
        if (this.aborted) {
          return;
        }
        this.aborted = true;
        return this[kHandler].onError(error);
      }
      addHeader(key, value) {
        processHeader(this, key, value);
        return this;
      }
    };
    __name(Request, "Request");
    function processHeader(request, key, val) {
      if (val && typeof val === "object") {
        throw new InvalidArgumentError2(`invalid ${key} header`);
      } else if (val === void 0) {
        return;
      }
      if (request.host === null && key.length === 4 && key.toLowerCase() === "host") {
        request.host = val;
      } else if (request.contentLength === null && key.length === 14 && key.toLowerCase() === "content-length") {
        request.contentLength = parseInt(val, 10);
        if (!Number.isFinite(request.contentLength)) {
          throw new InvalidArgumentError2("invalid content-length header");
        }
      } else if (request.contentType === null && key.length === 12 && key.toLowerCase() === "content-type") {
        request.contentType = val;
        request.headers += `${key}: ${val}\r
`;
      } else if (key.length === 17 && key.toLowerCase() === "transfer-encoding") {
        throw new InvalidArgumentError2("invalid transfer-encoding header");
      } else if (key.length === 10 && key.toLowerCase() === "connection") {
        throw new InvalidArgumentError2("invalid connection header");
      } else if (key.length === 10 && key.toLowerCase() === "keep-alive") {
        throw new InvalidArgumentError2("invalid keep-alive header");
      } else if (key.length === 7 && key.toLowerCase() === "upgrade") {
        throw new InvalidArgumentError2("invalid upgrade header");
      } else if (key.length === 6 && key.toLowerCase() === "expect") {
        throw new NotSupportedError("expect header not supported");
      } else {
        request.headers += `${key}: ${val}\r
`;
      }
    }
    __name(processHeader, "processHeader");
    module2.exports = Request;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/handler/redirect.js
var require_redirect = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/handler/redirect.js"(exports, module2) {
    "use strict";
    var util = require_util();
    var { kBodyUsed } = require_symbols();
    var assert = require("assert");
    var { InvalidArgumentError: InvalidArgumentError2 } = require_errors();
    var EE = require("events");
    var redirectableStatusCodes = [300, 301, 302, 303, 307, 308];
    var kBody = Symbol("body");
    var BodyAsyncIterable = class {
      constructor(body) {
        this[kBody] = body;
        this[kBodyUsed] = false;
      }
      async *[Symbol.asyncIterator]() {
        assert(!this[kBodyUsed], "disturbed");
        this[kBodyUsed] = true;
        yield* this[kBody];
      }
    };
    __name(BodyAsyncIterable, "BodyAsyncIterable");
    var RedirectHandler = class {
      constructor(dispatcher, maxRedirections, opts, handler) {
        if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
          throw new InvalidArgumentError2("maxRedirections must be a positive number");
        }
        util.validateHandler(handler, opts.method, opts.upgrade);
        this.dispatcher = dispatcher;
        this.location = null;
        this.abort = null;
        this.opts = { ...opts, maxRedirections: 0 };
        this.maxRedirections = maxRedirections;
        this.handler = handler;
        this.history = [];
        if (util.isStream(this.opts.body)) {
          if (util.bodyLength(this.opts.body) === 0) {
            this.opts.body.on("data", function() {
              assert(false);
            });
          }
          if (typeof this.opts.body.readableDidRead !== "boolean") {
            this.opts.body[kBodyUsed] = false;
            EE.prototype.on.call(this.opts.body, "data", function() {
              this[kBodyUsed] = true;
            });
          }
        } else if (this.opts.body && typeof this.opts.body.pipeTo === "function") {
          this.opts.body = new BodyAsyncIterable(this.opts.body);
        } else if (this.opts.body && typeof this.opts.body !== "string" && !ArrayBuffer.isView(this.opts.body) && util.isIterable(this.opts.body)) {
          this.opts.body = new BodyAsyncIterable(this.opts.body);
        }
      }
      onConnect(abort) {
        this.abort = abort;
        this.handler.onConnect(abort, { history: this.history });
      }
      onUpgrade(statusCode, headers, socket) {
        this.handler.onUpgrade(statusCode, headers, socket);
      }
      onError(error) {
        this.handler.onError(error);
      }
      onHeaders(statusCode, headers, resume, statusText) {
        this.location = this.history.length >= this.maxRedirections || util.isDisturbed(this.opts.body) ? null : parseLocation(statusCode, headers);
        if (this.opts.origin) {
          this.history.push(new URL(this.opts.path, this.opts.origin));
        }
        if (!this.location) {
          return this.handler.onHeaders(statusCode, headers, resume, statusText);
        }
        const { origin, pathname, search } = util.parseURL(new URL(this.location, this.opts.origin));
        const path = search ? `${pathname}${search}` : pathname;
        this.opts.headers = cleanRequestHeaders(this.opts.headers, statusCode === 303, this.opts.origin !== origin);
        this.opts.path = path;
        this.opts.origin = origin;
        this.opts.maxRedirections = 0;
        if (statusCode === 303 && this.opts.method !== "HEAD") {
          this.opts.method = "GET";
          this.opts.body = null;
        }
      }
      onData(chunk) {
        if (this.location) {
        } else {
          return this.handler.onData(chunk);
        }
      }
      onComplete(trailers) {
        if (this.location) {
          this.location = null;
          this.abort = null;
          this.dispatcher.dispatch(this.opts, this);
        } else {
          this.handler.onComplete(trailers);
        }
      }
      onBodySent(chunk) {
        if (this.handler.onBodySent) {
          this.handler.onBodySent(chunk);
        }
      }
    };
    __name(RedirectHandler, "RedirectHandler");
    function parseLocation(statusCode, headers) {
      if (redirectableStatusCodes.indexOf(statusCode) === -1) {
        return null;
      }
      for (let i = 0; i < headers.length; i += 2) {
        if (headers[i].toString().toLowerCase() === "location") {
          return headers[i + 1];
        }
      }
    }
    __name(parseLocation, "parseLocation");
    function shouldRemoveHeader(header, removeContent, unknownOrigin) {
      return header.length === 4 && header.toString().toLowerCase() === "host" || removeContent && header.toString().toLowerCase().indexOf("content-") === 0 || unknownOrigin && header.length === 13 && header.toString().toLowerCase() === "authorization";
    }
    __name(shouldRemoveHeader, "shouldRemoveHeader");
    function cleanRequestHeaders(headers, removeContent, unknownOrigin) {
      const ret = [];
      if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i += 2) {
          if (!shouldRemoveHeader(headers[i], removeContent, unknownOrigin)) {
            ret.push(headers[i], headers[i + 1]);
          }
        }
      } else if (headers && typeof headers === "object") {
        for (const key of Object.keys(headers)) {
          if (!shouldRemoveHeader(key, removeContent, unknownOrigin)) {
            ret.push(key, headers[key]);
          }
        }
      } else {
        assert(headers == null, "headers must be an object or an array");
      }
      return ret;
    }
    __name(cleanRequestHeaders, "cleanRequestHeaders");
    module2.exports = RedirectHandler;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/connect.js
var require_connect = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/core/connect.js"(exports, module2) {
    "use strict";
    var net = require("net");
    var assert = require("assert");
    var util = require_util();
    var { InvalidArgumentError: InvalidArgumentError2, ConnectTimeoutError } = require_errors();
    var tls;
    function buildConnector({ maxCachedSessions, socketPath, timeout, ...opts }) {
      if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
        throw new InvalidArgumentError2("maxCachedSessions must be a positive integer or zero");
      }
      const options = { path: socketPath, ...opts };
      const sessionCache = /* @__PURE__ */ new Map();
      timeout = timeout == null ? 1e4 : timeout;
      maxCachedSessions = maxCachedSessions == null ? 100 : maxCachedSessions;
      return /* @__PURE__ */ __name(function connect({ hostname, host, protocol, port, servername, httpSocket }, callback) {
        let socket;
        if (protocol === "https:") {
          if (!tls) {
            tls = require("tls");
          }
          servername = servername || options.servername || util.getServerName(host) || null;
          const sessionKey = servername || hostname;
          const session = sessionCache.get(sessionKey) || null;
          assert(sessionKey);
          socket = tls.connect({
            highWaterMark: 16384,
            ...options,
            servername,
            session,
            socket: httpSocket,
            port: port || 443,
            host: hostname
          });
          socket.on("session", function(session2) {
            if (maxCachedSessions === 0) {
              return;
            }
            if (sessionCache.size >= maxCachedSessions) {
              const { value: oldestKey } = sessionCache.keys().next();
              sessionCache.delete(oldestKey);
            }
            sessionCache.set(sessionKey, session2);
          }).on("error", function(err) {
            if (sessionKey && err.code !== "UND_ERR_INFO") {
              sessionCache.delete(sessionKey);
            }
          });
        } else {
          assert(!httpSocket, "httpSocket can only be sent on TLS update");
          socket = net.connect({
            highWaterMark: 64 * 1024,
            ...options,
            port: port || 80,
            host: hostname
          });
        }
        const timeoutId = timeout ? setTimeout(onConnectTimeout, timeout, socket) : null;
        socket.setNoDelay(true).once(protocol === "https:" ? "secureConnect" : "connect", function() {
          clearTimeout(timeoutId);
          if (callback) {
            const cb = callback;
            callback = null;
            cb(null, this);
          }
        }).on("error", function(err) {
          clearTimeout(timeoutId);
          if (callback) {
            const cb = callback;
            callback = null;
            cb(err);
          }
        });
        return socket;
      }, "connect");
    }
    __name(buildConnector, "buildConnector");
    function onConnectTimeout(socket) {
      util.destroy(socket, new ConnectTimeoutError());
    }
    __name(onConnectTimeout, "onConnectTimeout");
    module2.exports = buildConnector;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/utils.js
var require_utils2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.enumToMap = void 0;
    function enumToMap(obj) {
      const res = {};
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (typeof value === "number") {
          res[key] = value;
        }
      });
      return res;
    }
    __name(enumToMap, "enumToMap");
    exports.enumToMap = enumToMap;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/constants.js
var require_constants3 = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SPECIAL_HEADERS = exports.HEADER_STATE = exports.MINOR = exports.MAJOR = exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS = exports.TOKEN = exports.STRICT_TOKEN = exports.HEX = exports.URL_CHAR = exports.STRICT_URL_CHAR = exports.USERINFO_CHARS = exports.MARK = exports.ALPHANUM = exports.NUM = exports.HEX_MAP = exports.NUM_MAP = exports.ALPHA = exports.FINISH = exports.H_METHOD_MAP = exports.METHOD_MAP = exports.METHODS_RTSP = exports.METHODS_ICE = exports.METHODS_HTTP = exports.METHODS = exports.LENIENT_FLAGS = exports.FLAGS = exports.TYPE = exports.ERROR = void 0;
    var utils_1 = require_utils2();
    var ERROR;
    (function(ERROR2) {
      ERROR2[ERROR2["OK"] = 0] = "OK";
      ERROR2[ERROR2["INTERNAL"] = 1] = "INTERNAL";
      ERROR2[ERROR2["STRICT"] = 2] = "STRICT";
      ERROR2[ERROR2["LF_EXPECTED"] = 3] = "LF_EXPECTED";
      ERROR2[ERROR2["UNEXPECTED_CONTENT_LENGTH"] = 4] = "UNEXPECTED_CONTENT_LENGTH";
      ERROR2[ERROR2["CLOSED_CONNECTION"] = 5] = "CLOSED_CONNECTION";
      ERROR2[ERROR2["INVALID_METHOD"] = 6] = "INVALID_METHOD";
      ERROR2[ERROR2["INVALID_URL"] = 7] = "INVALID_URL";
      ERROR2[ERROR2["INVALID_CONSTANT"] = 8] = "INVALID_CONSTANT";
      ERROR2[ERROR2["INVALID_VERSION"] = 9] = "INVALID_VERSION";
      ERROR2[ERROR2["INVALID_HEADER_TOKEN"] = 10] = "INVALID_HEADER_TOKEN";
      ERROR2[ERROR2["INVALID_CONTENT_LENGTH"] = 11] = "INVALID_CONTENT_LENGTH";
      ERROR2[ERROR2["INVALID_CHUNK_SIZE"] = 12] = "INVALID_CHUNK_SIZE";
      ERROR2[ERROR2["INVALID_STATUS"] = 13] = "INVALID_STATUS";
      ERROR2[ERROR2["INVALID_EOF_STATE"] = 14] = "INVALID_EOF_STATE";
      ERROR2[ERROR2["INVALID_TRANSFER_ENCODING"] = 15] = "INVALID_TRANSFER_ENCODING";
      ERROR2[ERROR2["CB_MESSAGE_BEGIN"] = 16] = "CB_MESSAGE_BEGIN";
      ERROR2[ERROR2["CB_HEADERS_COMPLETE"] = 17] = "CB_HEADERS_COMPLETE";
      ERROR2[ERROR2["CB_MESSAGE_COMPLETE"] = 18] = "CB_MESSAGE_COMPLETE";
      ERROR2[ERROR2["CB_CHUNK_HEADER"] = 19] = "CB_CHUNK_HEADER";
      ERROR2[ERROR2["CB_CHUNK_COMPLETE"] = 20] = "CB_CHUNK_COMPLETE";
      ERROR2[ERROR2["PAUSED"] = 21] = "PAUSED";
      ERROR2[ERROR2["PAUSED_UPGRADE"] = 22] = "PAUSED_UPGRADE";
      ERROR2[ERROR2["PAUSED_H2_UPGRADE"] = 23] = "PAUSED_H2_UPGRADE";
      ERROR2[ERROR2["USER"] = 24] = "USER";
    })(ERROR = exports.ERROR || (exports.ERROR = {}));
    var TYPE;
    (function(TYPE2) {
      TYPE2[TYPE2["BOTH"] = 0] = "BOTH";
      TYPE2[TYPE2["REQUEST"] = 1] = "REQUEST";
      TYPE2[TYPE2["RESPONSE"] = 2] = "RESPONSE";
    })(TYPE = exports.TYPE || (exports.TYPE = {}));
    var FLAGS;
    (function(FLAGS2) {
      FLAGS2[FLAGS2["CONNECTION_KEEP_ALIVE"] = 1] = "CONNECTION_KEEP_ALIVE";
      FLAGS2[FLAGS2["CONNECTION_CLOSE"] = 2] = "CONNECTION_CLOSE";
      FLAGS2[FLAGS2["CONNECTION_UPGRADE"] = 4] = "CONNECTION_UPGRADE";
      FLAGS2[FLAGS2["CHUNKED"] = 8] = "CHUNKED";
      FLAGS2[FLAGS2["UPGRADE"] = 16] = "UPGRADE";
      FLAGS2[FLAGS2["CONTENT_LENGTH"] = 32] = "CONTENT_LENGTH";
      FLAGS2[FLAGS2["SKIPBODY"] = 64] = "SKIPBODY";
      FLAGS2[FLAGS2["TRAILING"] = 128] = "TRAILING";
      FLAGS2[FLAGS2["TRANSFER_ENCODING"] = 512] = "TRANSFER_ENCODING";
    })(FLAGS = exports.FLAGS || (exports.FLAGS = {}));
    var LENIENT_FLAGS;
    (function(LENIENT_FLAGS2) {
      LENIENT_FLAGS2[LENIENT_FLAGS2["HEADERS"] = 1] = "HEADERS";
      LENIENT_FLAGS2[LENIENT_FLAGS2["CHUNKED_LENGTH"] = 2] = "CHUNKED_LENGTH";
      LENIENT_FLAGS2[LENIENT_FLAGS2["KEEP_ALIVE"] = 4] = "KEEP_ALIVE";
    })(LENIENT_FLAGS = exports.LENIENT_FLAGS || (exports.LENIENT_FLAGS = {}));
    var METHODS;
    (function(METHODS2) {
      METHODS2[METHODS2["DELETE"] = 0] = "DELETE";
      METHODS2[METHODS2["GET"] = 1] = "GET";
      METHODS2[METHODS2["HEAD"] = 2] = "HEAD";
      METHODS2[METHODS2["POST"] = 3] = "POST";
      METHODS2[METHODS2["PUT"] = 4] = "PUT";
      METHODS2[METHODS2["CONNECT"] = 5] = "CONNECT";
      METHODS2[METHODS2["OPTIONS"] = 6] = "OPTIONS";
      METHODS2[METHODS2["TRACE"] = 7] = "TRACE";
      METHODS2[METHODS2["COPY"] = 8] = "COPY";
      METHODS2[METHODS2["LOCK"] = 9] = "LOCK";
      METHODS2[METHODS2["MKCOL"] = 10] = "MKCOL";
      METHODS2[METHODS2["MOVE"] = 11] = "MOVE";
      METHODS2[METHODS2["PROPFIND"] = 12] = "PROPFIND";
      METHODS2[METHODS2["PROPPATCH"] = 13] = "PROPPATCH";
      METHODS2[METHODS2["SEARCH"] = 14] = "SEARCH";
      METHODS2[METHODS2["UNLOCK"] = 15] = "UNLOCK";
      METHODS2[METHODS2["BIND"] = 16] = "BIND";
      METHODS2[METHODS2["REBIND"] = 17] = "REBIND";
      METHODS2[METHODS2["UNBIND"] = 18] = "UNBIND";
      METHODS2[METHODS2["ACL"] = 19] = "ACL";
      METHODS2[METHODS2["REPORT"] = 20] = "REPORT";
      METHODS2[METHODS2["MKACTIVITY"] = 21] = "MKACTIVITY";
      METHODS2[METHODS2["CHECKOUT"] = 22] = "CHECKOUT";
      METHODS2[METHODS2["MERGE"] = 23] = "MERGE";
      METHODS2[METHODS2["M-SEARCH"] = 24] = "M-SEARCH";
      METHODS2[METHODS2["NOTIFY"] = 25] = "NOTIFY";
      METHODS2[METHODS2["SUBSCRIBE"] = 26] = "SUBSCRIBE";
      METHODS2[METHODS2["UNSUBSCRIBE"] = 27] = "UNSUBSCRIBE";
      METHODS2[METHODS2["PATCH"] = 28] = "PATCH";
      METHODS2[METHODS2["PURGE"] = 29] = "PURGE";
      METHODS2[METHODS2["MKCALENDAR"] = 30] = "MKCALENDAR";
      METHODS2[METHODS2["LINK"] = 31] = "LINK";
      METHODS2[METHODS2["UNLINK"] = 32] = "UNLINK";
      METHODS2[METHODS2["SOURCE"] = 33] = "SOURCE";
      METHODS2[METHODS2["PRI"] = 34] = "PRI";
      METHODS2[METHODS2["DESCRIBE"] = 35] = "DESCRIBE";
      METHODS2[METHODS2["ANNOUNCE"] = 36] = "ANNOUNCE";
      METHODS2[METHODS2["SETUP"] = 37] = "SETUP";
      METHODS2[METHODS2["PLAY"] = 38] = "PLAY";
      METHODS2[METHODS2["PAUSE"] = 39] = "PAUSE";
      METHODS2[METHODS2["TEARDOWN"] = 40] = "TEARDOWN";
      METHODS2[METHODS2["GET_PARAMETER"] = 41] = "GET_PARAMETER";
      METHODS2[METHODS2["SET_PARAMETER"] = 42] = "SET_PARAMETER";
      METHODS2[METHODS2["REDIRECT"] = 43] = "REDIRECT";
      METHODS2[METHODS2["RECORD"] = 44] = "RECORD";
      METHODS2[METHODS2["FLUSH"] = 45] = "FLUSH";
    })(METHODS = exports.METHODS || (exports.METHODS = {}));
    exports.METHODS_HTTP = [
      METHODS.DELETE,
      METHODS.GET,
      METHODS.HEAD,
      METHODS.POST,
      METHODS.PUT,
      METHODS.CONNECT,
      METHODS.OPTIONS,
      METHODS.TRACE,
      METHODS.COPY,
      METHODS.LOCK,
      METHODS.MKCOL,
      METHODS.MOVE,
      METHODS.PROPFIND,
      METHODS.PROPPATCH,
      METHODS.SEARCH,
      METHODS.UNLOCK,
      METHODS.BIND,
      METHODS.REBIND,
      METHODS.UNBIND,
      METHODS.ACL,
      METHODS.REPORT,
      METHODS.MKACTIVITY,
      METHODS.CHECKOUT,
      METHODS.MERGE,
      METHODS["M-SEARCH"],
      METHODS.NOTIFY,
      METHODS.SUBSCRIBE,
      METHODS.UNSUBSCRIBE,
      METHODS.PATCH,
      METHODS.PURGE,
      METHODS.MKCALENDAR,
      METHODS.LINK,
      METHODS.UNLINK,
      METHODS.PRI,
      METHODS.SOURCE
    ];
    exports.METHODS_ICE = [
      METHODS.SOURCE
    ];
    exports.METHODS_RTSP = [
      METHODS.OPTIONS,
      METHODS.DESCRIBE,
      METHODS.ANNOUNCE,
      METHODS.SETUP,
      METHODS.PLAY,
      METHODS.PAUSE,
      METHODS.TEARDOWN,
      METHODS.GET_PARAMETER,
      METHODS.SET_PARAMETER,
      METHODS.REDIRECT,
      METHODS.RECORD,
      METHODS.FLUSH,
      METHODS.GET,
      METHODS.POST
    ];
    exports.METHOD_MAP = utils_1.enumToMap(METHODS);
    exports.H_METHOD_MAP = {};
    Object.keys(exports.METHOD_MAP).forEach((key) => {
      if (/^H/.test(key)) {
        exports.H_METHOD_MAP[key] = exports.METHOD_MAP[key];
      }
    });
    var FINISH;
    (function(FINISH2) {
      FINISH2[FINISH2["SAFE"] = 0] = "SAFE";
      FINISH2[FINISH2["SAFE_WITH_CB"] = 1] = "SAFE_WITH_CB";
      FINISH2[FINISH2["UNSAFE"] = 2] = "UNSAFE";
    })(FINISH = exports.FINISH || (exports.FINISH = {}));
    exports.ALPHA = [];
    for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
      exports.ALPHA.push(String.fromCharCode(i));
      exports.ALPHA.push(String.fromCharCode(i + 32));
    }
    exports.NUM_MAP = {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
      9: 9
    };
    exports.HEX_MAP = {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
      9: 9,
      A: 10,
      B: 11,
      C: 12,
      D: 13,
      E: 14,
      F: 15,
      a: 10,
      b: 11,
      c: 12,
      d: 13,
      e: 14,
      f: 15
    };
    exports.NUM = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9"
    ];
    exports.ALPHANUM = exports.ALPHA.concat(exports.NUM);
    exports.MARK = ["-", "_", ".", "!", "~", "*", "'", "(", ")"];
    exports.USERINFO_CHARS = exports.ALPHANUM.concat(exports.MARK).concat(["%", ";", ":", "&", "=", "+", "$", ","]);
    exports.STRICT_URL_CHAR = [
      "!",
      '"',
      "$",
      "%",
      "&",
      "'",
      "(",
      ")",
      "*",
      "+",
      ",",
      "-",
      ".",
      "/",
      ":",
      ";",
      "<",
      "=",
      ">",
      "@",
      "[",
      "\\",
      "]",
      "^",
      "_",
      "`",
      "{",
      "|",
      "}",
      "~"
    ].concat(exports.ALPHANUM);
    exports.URL_CHAR = exports.STRICT_URL_CHAR.concat(["	", "\f"]);
    for (let i = 128; i <= 255; i++) {
      exports.URL_CHAR.push(i);
    }
    exports.HEX = exports.NUM.concat(["a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"]);
    exports.STRICT_TOKEN = [
      "!",
      "#",
      "$",
      "%",
      "&",
      "'",
      "*",
      "+",
      "-",
      ".",
      "^",
      "_",
      "`",
      "|",
      "~"
    ].concat(exports.ALPHANUM);
    exports.TOKEN = exports.STRICT_TOKEN.concat([" "]);
    exports.HEADER_CHARS = ["	"];
    for (let i = 32; i <= 255; i++) {
      if (i !== 127) {
        exports.HEADER_CHARS.push(i);
      }
    }
    exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS.filter((c) => c !== 44);
    exports.MAJOR = exports.NUM_MAP;
    exports.MINOR = exports.MAJOR;
    var HEADER_STATE;
    (function(HEADER_STATE2) {
      HEADER_STATE2[HEADER_STATE2["GENERAL"] = 0] = "GENERAL";
      HEADER_STATE2[HEADER_STATE2["CONNECTION"] = 1] = "CONNECTION";
      HEADER_STATE2[HEADER_STATE2["CONTENT_LENGTH"] = 2] = "CONTENT_LENGTH";
      HEADER_STATE2[HEADER_STATE2["TRANSFER_ENCODING"] = 3] = "TRANSFER_ENCODING";
      HEADER_STATE2[HEADER_STATE2["UPGRADE"] = 4] = "UPGRADE";
      HEADER_STATE2[HEADER_STATE2["CONNECTION_KEEP_ALIVE"] = 5] = "CONNECTION_KEEP_ALIVE";
      HEADER_STATE2[HEADER_STATE2["CONNECTION_CLOSE"] = 6] = "CONNECTION_CLOSE";
      HEADER_STATE2[HEADER_STATE2["CONNECTION_UPGRADE"] = 7] = "CONNECTION_UPGRADE";
      HEADER_STATE2[HEADER_STATE2["TRANSFER_ENCODING_CHUNKED"] = 8] = "TRANSFER_ENCODING_CHUNKED";
    })(HEADER_STATE = exports.HEADER_STATE || (exports.HEADER_STATE = {}));
    exports.SPECIAL_HEADERS = {
      "connection": HEADER_STATE.CONNECTION,
      "content-length": HEADER_STATE.CONTENT_LENGTH,
      "proxy-connection": HEADER_STATE.CONNECTION,
      "transfer-encoding": HEADER_STATE.TRANSFER_ENCODING,
      "upgrade": HEADER_STATE.UPGRADE
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/llhttp.wasm.js
var require_llhttp_wasm = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/llhttp.wasm.js"(exports, module2) {
    module2.exports = "AGFzbQEAAAABMAhgAX8Bf2ADf39/AX9gBH9/f38Bf2AAAGADf39/AGABfwBgAn9/AGAGf39/f39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQACA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAzk4AwMEAAAFAAAAAAAABQEFAAUFBQAABgAAAAYGAQEBAQEBAQEBAQEBAQEBAQABAAABAQcAAAUFAAMEBQFwAQ4OBQMBAAIGCAF/AUGgtwQLB/UEHwZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAJGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAKGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQA1DGxsaHR0cF9hbGxvYwAMBm1hbGxvYwA6C2xsaHR0cF9mcmVlAA0EZnJlZQA8D2xsaHR0cF9nZXRfdHlwZQAOFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAPFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAQEWxsaHR0cF9nZXRfbWV0aG9kABEWbGxodHRwX2dldF9zdGF0dXNfY29kZQASEmxsaHR0cF9nZXRfdXBncmFkZQATDGxsaHR0cF9yZXNldAAUDmxsaHR0cF9leGVjdXRlABUUbGxodHRwX3NldHRpbmdzX2luaXQAFg1sbGh0dHBfZmluaXNoABcMbGxodHRwX3BhdXNlABgNbGxodHRwX3Jlc3VtZQAZG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAaEGxsaHR0cF9nZXRfZXJybm8AGxdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAcF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uAB0UbGxodHRwX2dldF9lcnJvcl9wb3MAHhFsbGh0dHBfZXJybm9fbmFtZQAfEmxsaHR0cF9tZXRob2RfbmFtZQAgGmxsaHR0cF9zZXRfbGVuaWVudF9oZWFkZXJzACEhbGxodHRwX3NldF9sZW5pZW50X2NodW5rZWRfbGVuZ3RoACIYbGxodHRwX21lc3NhZ2VfbmVlZHNfZW9mADMJEwEAQQELDQECAwQFCwYHLiooJCYK56QCOAIACwgAEIiAgIAACxkAIAAQtoCAgAAaIAAgAjYCNCAAIAE6ACgLHAAgACAALwEyIAAtAC4gABC1gICAABCAgICAAAspAQF/QTgQuoCAgAAiARC2gICAABogAUGAiICAADYCNCABIAA6ACggAQsKACAAELyAgIAACwcAIAAtACgLBwAgAC0AKgsHACAALQArCwcAIAAtACkLBwAgAC8BMgsHACAALQAuC0UBBH8gACgCGCEBIAAtAC0hAiAALQAoIQMgACgCNCEEIAAQtoCAgAAaIAAgBDYCNCAAIAM6ACggACACOgAtIAAgATYCGAsRACAAIAEgASACahC3gICAAAtFACAAQgA3AgAgAEEwakIANwIAIABBKGpCADcCACAAQSBqQgA3AgAgAEEYakIANwIAIABBEGpCADcCACAAQQhqQgA3AgALZwEBf0EAIQECQCAAKAIMDQACQAJAAkACQCAALQAvDgMBAAMCCyAAKAI0IgFFDQAgASgCHCIBRQ0AIAAgARGAgICAAAAiAQ0DC0EADwsQv4CAgAAACyAAQa+RgIAANgIQQQ4hAQsgAQseAAJAIAAoAgwNACAAQbSTgIAANgIQIABBFTYCDAsLFgACQCAAKAIMQRVHDQAgAEEANgIMCwsWAAJAIAAoAgxBFkcNACAAQQA2AgwLCwcAIAAoAgwLBwAgACgCEAsJACAAIAE2AhALBwAgACgCFAsiAAJAIABBGUkNABC/gICAAAALIABBAnRB6JqAgABqKAIACyIAAkAgAEEuSQ0AEL+AgIAAAAsgAEECdEHMm4CAAGooAgALFgAgACAALQAtQf4BcSABQQBHcjoALQsZACAAIAAtAC1B/QFxIAFBAEdBAXRyOgAtCy4BAn9BACEDAkAgACgCNCIERQ0AIAQoAgAiBEUNACAAIAQRgICAgAAAIQMLIAMLSQECf0EAIQMCQCAAKAI0IgRFDQAgBCgCBCIERQ0AIAAgASACIAFrIAQRgYCAgAAAIgNBf0cNACAAQZyOgIAANgIQQRghAwsgAwsuAQJ/QQAhAwJAIAAoAjQiBEUNACAEKAIoIgRFDQAgACAEEYCAgIAAACEDCyADC0kBAn9BACEDAkAgACgCNCIERQ0AIAQoAggiBEUNACAAIAEgAiABayAEEYGAgIAAACIDQX9HDQAgAEHSioCAADYCEEEYIQMLIAMLLgECf0EAIQMCQCAAKAI0IgRFDQAgBCgCLCIERQ0AIAAgBBGAgICAAAAhAwsgAwtJAQJ/QQAhAwJAIAAoAjQiBEUNACAEKAIMIgRFDQAgACABIAIgAWsgBBGBgICAAAAiA0F/Rw0AIABBjZOAgAA2AhBBGCEDCyADCy4BAn9BACEDAkAgACgCNCIERQ0AIAQoAjAiBEUNACAAIAQRgICAgAAAIQMLIAMLSQECf0EAIQMCQCAAKAI0IgRFDQAgBCgCECIERQ0AIAAgASACIAFrIAQRgYCAgAAAIgNBf0cNACAAQcOQgIAANgIQQRghAwsgAwsuAQJ/QQAhAwJAIAAoAjQiBEUNACAEKAI0IgRFDQAgACAEEYCAgIAAACEDCyADCy4BAn9BACEDAkAgACgCNCIERQ0AIAQoAhQiBEUNACAAIAQRgICAgAAAIQMLIAMLLgECf0EAIQMCQCAAKAI0IgRFDQAgBCgCHCIERQ0AIAAgBBGAgICAAAAhAwsgAwtJAQJ/QQAhAwJAIAAoAjQiBEUNACAEKAIYIgRFDQAgACABIAIgAWsgBBGBgICAAAAiA0F/Rw0AIABB0oiAgAA2AhBBGCEDCyADCy4BAn9BACEDAkAgACgCNCIERQ0AIAQoAiAiBEUNACAAIAQRgICAgAAAIQMLIAMLLgECf0EAIQMCQCAAKAI0IgRFDQAgBCgCJCIERQ0AIAAgBBGAgICAAAAhAwsgAwtFAQF/AkACQCAALwEwQRRxQRRHDQBBASEDIAAtAChBAUYNASAALwEyQeUARiEDDAELIAAtAClBBUYhAwsgACADOgAuQQAL9AEBA39BASEDAkAgAC8BMCIEQQhxDQAgACkDIEIAUiEDCwJAAkAgAC0ALkUNAEEBIQUgAC0AKUEFRg0BQQEhBSAEQcAAcUUgA3FBAUcNAQtBACEFIARBwABxDQBBAiEFIARBCHENAAJAIARBgARxRQ0AAkAgAC0AKEEBRw0AQQUhBSAALQAtQQJxRQ0CC0EEDwsCQCAEQSBxDQACQCAALQAoQQFGDQAgAC8BMiIAQZx/akHkAEkNACAAQcwBRg0AIABBsAJGDQBBBCEFIARBiARxQYAERg0CIARBKHFFDQILQQAPC0EAQQMgACkDIFAbIQULIAULXQECf0EAIQECQCAALQAoQQFGDQAgAC8BMiICQZx/akHkAEkNACACQcwBRg0AIAJBsAJGDQAgAC8BMCIAQcAAcQ0AQQEhASAAQYgEcUGABEYNACAAQShxRSEBCyABC6IBAQN/AkACQAJAIAAtACpFDQAgAC0AK0UNAEEAIQMgAC8BMCIEQQJxRQ0BDAILQQAhAyAALwEwIgRBAXFFDQELQQEhAyAALQAoQQFGDQAgAC8BMiIFQZx/akHkAEkNACAFQcwBRg0AIAVBsAJGDQAgBEHAAHENAEEAIQMgBEGIBHFBgARGDQAgBEEocUEARyEDCyAAQQA7ATAgAEEAOgAvIAMLlAEBAn8CQAJAAkAgAC0AKkUNACAALQArRQ0AQQAhASAALwEwIgJBAnFFDQEMAgtBACEBIAAvATAiAkEBcUUNAQtBASEBIAAtAChBAUYNACAALwEyIgBBnH9qQeQASQ0AIABBzAFGDQAgAEGwAkYNACACQcAAcQ0AQQAhASACQYgEcUGABEYNACACQShxQQBHIQELIAELTwAgAEEYakIANwMAIABCADcDACAAQTBqQgA3AwAgAEEoakIANwMAIABBIGpCADcDACAAQRBqQgA3AwAgAEEIakIANwMAIABBuAE2AhxBAAt7AQF/AkAgACgCDCIDDQACQCAAKAIERQ0AIAAgATYCBAsCQCAAIAEgAhC4gICAACIDDQAgACgCDA8LIAAgAzYCHEEAIQMgACgCBCIBRQ0AIAAgASACIAAoAggRgYCAgAAAIgFFDQAgACACNgIUIAAgATYCDCABIQMLIAML8soBAxl/A34FfyOAgICAAEEQayIDJICAgIAAIAEhBCABIQUgASEGIAEhByABIQggASEJIAEhCiABIQsgASEMIAEhDSABIQ4gASEPIAEhECABIREgASESIAEhEyABIRQgASEVIAEhFiABIRcgASEYIAEhGSABIRoCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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QQEhGwwPC0GbASEbDA4LQZwBIRsMDQtBngEhGwwMC0GgASEbDAsLQZ8BIRsMCgtBoQEhGwwJC0GiASEbDAgLQaMBIRsMBwtBpAEhGwwGC0GlASEbDAULQaYBIRsMBAtBpwEhGwwDC0GoASEbDAILQakBIRsMAQtBrwEhGwsDQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgGw6wAQABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGx0fICEkJSYnKCkqKy0uLzAxNzg6Oz5BQ0RFRkdISUpLTE1OT1BRUlNUVVdZW15fYGJkZWZnaGlqbW5vcHFyc3R1dnd4eXp7fH1+f4ABgQGCAYMBhAGFAYYBhwGIAYkBigGLAYwBjQGOAY8BkAGRAZIBkwGUAZUBlgGXAZgBmQGaAZsBnAGdAZ4BnwGgAaEBogGjAaQBpQGmAacBqAGpAaoBqwGsAa0BrgGvAbABsQGyAbMBtAG2AbcBuAG5AboBuwG8Ab0BvgG/AcABwQHCAcMBxAHcAeIB4wHnAfYBwwLDAgsgASIEIAJHDcQBQbgBIRsMkgMLIAEiGyACRw2zAUGoASEbDJEDCyABIgEgAkcNaUHeACEbDJADCyABIgEgAkcNX0HWACEbDI8DCyABIgEgAkcNWEHRACEbDI4DCyABIgEgAkcNVEHPACEbDI0DCyABIgEgAkcNUUHNACEbDIwDCyABIgEgAkcNTkHLACEbDIsDCyABIgEgAkcNEUEMIRsMigMLIAEiASACRw01QTQhGwyJAwsgASIBIAJHDTFBMSEbDIgDCyABIhogAkcNKEEuIRsMhwMLIAEiASACRw0mQSwhGwyGAwsgASIBIAJHDSRBKyEbDIUDCyABIgEgAkcNHUEiIRsMhAMLIAAtAC5BAUYN/AIMyAELIAAgASIBIAIQtICAgABBAUcNtQEMtgELIAAgASIBIAIQrYCAgAAiGw22ASABIQEMtgILAkAgASIBIAJHDQBBBiEbDIEDCyAAIAFBAWoiASACELCAgIAAIhsNtwEgASEBDA8LIABCADcDIEEUIRsM9AILIAEiGyACRw0JQQ8hGwz+AgsCQCABIgEgAkYNACABQQFqIQFBEiEbDPMCC0EHIRsM/QILIABCACAAKQMgIhwgAiABIhtrrSIdfSIeIB4gHFYbNwMgIBwgHVYiH0UNtAFBCCEbDPwCCwJAIAEiASACRg0AIABBiYCAgAA2AgggACABNgIEIAEhAUEWIRsM8QILQQkhGwz7AgsgASEBIAApAyBQDbMBIAEhAQyzAgsCQCABIgEgAkcNAEELIRsM+gILIAAgAUEBaiIBIAIQr4CAgAAiGw2zASABIQEMswILA0ACQCABLQAAQZCdgIAAai0AACIbQQFGDQAgG0ECRw21ASABQQFqIQEMAwsgAUEBaiIBIAJHDQALQQwhGwz4AgsCQCABIgEgAkcNAEENIRsM+AILAkACQCABLQAAIhtBc2oOFAG3AbcBtwG3AbcBtwG3AbcBtwG3AbcBtwG3AbcBtwG3AbcBtwEAtQELIAFBAWohAQy1AQsgAUEBaiEBC0EZIRsM6wILAkAgASIbIAJHDQBBDiEbDPYCC0IAIRwgGyEBAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCAbLQAAQVBqDjfJAcgBAAECAwQFBgfEAsQCxALEAsQCxALEAggJCgsMDcQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAIODxAREhPEAgtCAiEcDMgBC0IDIRwMxwELQgQhHAzGAQtCBSEcDMUBC0IGIRwMxAELQgchHAzDAQtCCCEcDMIBC0IJIRwMwQELQgohHAzAAQtCCyEcDL8BC0IMIRwMvgELQg0hHAy9AQtCDiEcDLwBC0IPIRwMuwELQgohHAy6AQtCCyEcDLkBC0IMIRwMuAELQg0hHAy3AQtCDiEcDLYBC0IPIRwMtQELQgAhHAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgGy0AAEFQag43yAHHAQABAgMEBQYHyQHJAckByQHJAckByQEICQoLDA3JAckByQHJAckByQHJAckByQHJAckByQHJAckByQHJAckByQHJAckByQHJAckByQHJAckBDg8QERITyQELQgIhHAzHAQtCAyEcDMYBC0IEIRwMxQELQgUhHAzEAQtCBiEcDMMBC0IHIRwMwgELQgghHAzBAQtCCSEcDMABC0IKIRwMvwELQgshHAy+AQtCDCEcDL0BC0INIRwMvAELQg4hHAy7AQtCDyEcDLoBC0IKIRwMuQELQgshHAy4AQtCDCEcDLcBC0INIRwMtgELQg4hHAy1AQtCDyEcDLQBCyAAQgAgACkDICIcIAIgASIba60iHX0iHiAeIBxWGzcDICAcIB1WIh9FDbUBQREhGwzzAgsCQCABIgEgAkYNACAAQYmAgIAANgIIIAAgATYCBCABIQFBHCEbDOgCC0ESIRsM8gILIAAgASIbIAIQsoCAgABBf2oOBacBAKgCAbQBtQELQRMhGwzlAgsgAEEBOgAvIBshAQzuAgsgASIBIAJHDbUBQRYhGwzuAgsgASIYIAJHDRpBNSEbDO0CCwJAIAEiASACRw0AQRohGwztAgsgAEEANgIEIABBioCAgAA2AgggACABIAEQqoCAgAAiGw23ASABIQEMugELAkAgASIbIAJHDQBBGyEbDOwCCwJAIBstAAAiAUEgRw0AIBtBAWohAQwbCyABQQlHDbcBIBtBAWohAQwaCwJAIAEiASACRg0AIAFBAWohAQwVC0EcIRsM6gILAkAgASIbIAJHDQBBHSEbDOoCCwJAIBstAAAiAUEJRw0AIBshAQzWAgsgAUEgRw22ASAbIQEM1QILAkAgASIBIAJHDQBBHiEbDOkCCyABLQAAQQpHDbkBIAFBAWohAQymAgsCQCABIhkgAkcNAEEgIRsM6AILIBktAABBdmoOBLwBugG6AbkBugELA0ACQCABLQAAIhtBIEYNAAJAIBtBdmoOBADDAcMBAMEBCyABIQEMyQELIAFBAWoiASACRw0AC0EiIRsM5gILQSMhGyABIiAgAkYN5QIgAiAgayAAKAIAIiFqISIgICEjICEhAQJAA0AgIy0AACIfQSByIB8gH0G/f2pB/wFxQRpJG0H/AXEgAUGQn4CAAGotAABHDQEgAUEDRg3WAiABQQFqIQEgI0EBaiIjIAJHDQALIAAgIjYCAAzmAgsgAEEANgIAICMhAQzAAQtBJCEbIAEiICACRg3kAiACICBrIAAoAgAiIWohIiAgISMgISEBAkADQCAjLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQZSfgIAAai0AAEcNASABQQhGDcIBIAFBAWohASAjQQFqIiMgAkcNAAsgACAiNgIADOUCCyAAQQA2AgAgIyEBDL8BC0ElIRsgASIgIAJGDeMCIAIgIGsgACgCACIhaiEiICAhIyAhIQECQANAICMtAAAiH0EgciAfIB9Bv39qQf8BcUEaSRtB/wFxIAFB8KWAgABqLQAARw0BIAFBBUYNwgEgAUEBaiEBICNBAWoiIyACRw0ACyAAICI2AgAM5AILIABBADYCACAjIQEMvgELAkAgASIBIAJGDQADQAJAIAEtAABBoKGAgABqLQAAIhtBAUYNACAbQQJGDQsgASEBDMYBCyABQQFqIgEgAkcNAAtBISEbDOMCC0EhIRsM4gILAkAgASIBIAJGDQADQAJAIAEtAAAiG0EgRg0AIBtBdmoOBMIBwwHDAcIBwwELIAFBAWoiASACRw0AC0EpIRsM4gILQSkhGwzhAgsDQAJAIAEtAAAiG0EgRg0AIBtBdmoOBMIBBATCAQQLIAFBAWoiASACRw0AC0ErIRsM4AILA0ACQCABLQAAIhtBIEYNACAbQQlHDQQLIAFBAWoiASACRw0AC0EsIRsM3wILA0ACQCAaLQAAQaChgIAAai0AACIBQQFGDQAgAUECRw3HASAaQQFqIQEMlAILIBpBAWoiGiACRw0AC0EuIRsM3gILIAEhAQzCAQsgASEBDMEBC0EvIRsgASIjIAJGDdsCIAIgI2sgACgCACIgaiEhICMhHyAgIQEDQCAfLQAAQSByIAFBoKOAgABqLQAARw3OAiABQQZGDc0CIAFBAWohASAfQQFqIh8gAkcNAAsgACAhNgIADNsCCwJAIAEiGiACRw0AQTAhGwzbAgsgAEGKgICAADYCCCAAIBo2AgQgGiEBIAAtACxBf2oOBLMBvAG+AcABmgILIAFBAWohAQyyAQsCQCABIgEgAkYNAANAAkAgAS0AACIbQSByIBsgG0G/f2pB/wFxQRpJG0H/AXEiG0EJRg0AIBtBIEYNAAJAAkACQAJAIBtBnX9qDhMAAwMDAwMDAwEDAwMDAwMDAwMCAwsgAUEBaiEBQSchGwzTAgsgAUEBaiEBQSghGwzSAgsgAUEBaiEBQSkhGwzRAgsgASEBDLYBCyABQQFqIgEgAkcNAAtBJiEbDNkCC0EmIRsM2AILAkAgASIBIAJGDQADQAJAIAEtAABBoJ+AgABqLQAAQQFGDQAgASEBDLsBCyABQQFqIgEgAkcNAAtBLSEbDNgCC0EtIRsM1wILAkADQAJAIAEtAABBd2oOGAACxALEAsYCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCAMQCCyABQQFqIgEgAkcNAAtBMSEbDNcCCyABQQFqIQELQSIhGwzKAgsgASIBIAJHDb0BQTMhGwzUAgsDQAJAIAEtAABBsKOAgABqLQAAQQFGDQAgASEBDJYCCyABQQFqIgEgAkcNAAtBNCEbDNMCCyAYLQAAIhtBIEYNmgEgG0E6Rw3GAiAAKAIEIQEgAEEANgIEIAAgASAYEKiAgIAAIgENugEgGEEBaiEBDLwBCyAAIAEgAhCpgICAABoLQQohGwzFAgtBNiEbIAEiIyACRg3PAiACICNrIAAoAgAiIGohISAjIRggICEBAkADQCAYLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQbClgIAAai0AAEcNxAIgAUEFRg0BIAFBAWohASAYQQFqIhggAkcNAAsgACAhNgIADNACCyAAQQA2AgAgAEEBOgAsICMgIGtBBmohAQy9AgtBNyEbIAEiIyACRg3OAiACICNrIAAoAgAiIGohISAjIRggICEBAkADQCAYLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQbalgIAAai0AAEcNwwIgAUEJRg0BIAFBAWohASAYQQFqIhggAkcNAAsgACAhNgIADM8CCyAAQQA2AgAgAEECOgAsICMgIGtBCmohAQy8AgsCQCABIhggAkcNAEE4IRsMzgILAkACQCAYLQAAIgFBIHIgASABQb9/akH/AXFBGkkbQf8BcUGSf2oOBwDDAsMCwwLDAsMCAcMCCyAYQQFqIQFBMiEbDMMCCyAYQQFqIQFBMyEbDMICC0E5IRsgASIjIAJGDcwCIAIgI2sgACgCACIgaiEhICMhGCAgIQEDQCAYLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQcClgIAAai0AAEcNwAIgAUEBRg23AiABQQFqIQEgGEEBaiIYIAJHDQALIAAgITYCAAzMAgtBOiEbIAEiIyACRg3LAiACICNrIAAoAgAiIGohISAjIRggICEBAkADQCAYLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQcKlgIAAai0AAEcNwAIgAUEORg0BIAFBAWohASAYQQFqIhggAkcNAAsgACAhNgIADMwCCyAAQQA2AgAgAEEBOgAsICMgIGtBD2ohAQy5AgtBOyEbIAEiIyACRg3KAiACICNrIAAoAgAiIGohISAjIRggICEBAkADQCAYLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQeClgIAAai0AAEcNvwIgAUEPRg0BIAFBAWohASAYQQFqIhggAkcNAAsgACAhNgIADMsCCyAAQQA2AgAgAEEDOgAsICMgIGtBEGohAQy4AgtBPCEbIAEiIyACRg3JAiACICNrIAAoAgAiIGohISAjIRggICEBAkADQCAYLQAAIh9BIHIgHyAfQb9/akH/AXFBGkkbQf8BcSABQfClgIAAai0AAEcNvgIgAUEFRg0BIAFBAWohASAYQQFqIhggAkcNAAsgACAhNgIADMoCCyAAQQA2AgAgAEEEOgAsICMgIGtBBmohAQy3AgsCQCABIhggAkcNAEE9IRsMyQILAkACQAJAAkAgGC0AACIBQSByIAEgAUG/f2pB/wFxQRpJG0H/AXFBnX9qDhMAwALAAsACwALAAsACwALAAsACwALAAsACAcACwALAAgIDwAILIBhBAWohAUE1IRsMwAILIBhBAWohAUE2IRsMvwILIBhBAWohAUE3IRsMvgILIBhBAWohAUE4IRsMvQILAkAgASIBIAJGDQAgAEGLgICAADYCCCAAIAE2AgQgASEBQTkhGwy9AgtBPiEbDMcCCyABIgEgAkcNswFBwAAhGwzGAgtBwQAhGyABIiMgAkYNxQIgAiAjayAAKAIAIiBqISEgIyEfICAhAQJAA0AgHy0AACABQfalgIAAai0AAEcNuAEgAUEBRg0BIAFBAWohASAfQQFqIh8gAkcNAAsgACAhNgIADMYCCyAAQQA2AgAgIyAga0ECaiEBDLMBCwJAIAEiASACRw0AQcMAIRsMxQILIAEtAABBCkcNtwEgAUEBaiEBDLMBCwJAIAEiASACRw0AQcQAIRsMxAILAkACQCABLQAAQXZqDgQBuAG4AQC4AQsgAUEBaiEBQT0hGwy5AgsgAUEBaiEBDLIBCwJAIAEiASACRw0AQcUAIRsMwwILQQAhGwJAAkACQAJAAkACQAJAAkAgAS0AAEFQag4KvwG+AQABAgMEBQYHwAELQQIhGwy+AQtBAyEbDL0BC0EEIRsMvAELQQUhGwy7AQtBBiEbDLoBC0EHIRsMuQELQQghGwy4AQtBCSEbDLcBCwJAIAEiASACRw0AQcYAIRsMwgILIAEtAABBLkcNuAEgAUEBaiEBDIYCCwJAIAEiASACRw0AQccAIRsMwQILQQAhGwJAAkACQAJAAkACQAJAAkAgAS0AAEFQag4KwQHAAQABAgMEBQYHwgELQQIhGwzAAQtBAyEbDL8BC0EEIRsMvgELQQUhGwy9AQtBBiEbDLwBC0EHIRsMuwELQQghGwy6AQtBCSEbDLkBC0HIACEbIAEiIyACRg2/AiACICNrIAAoAgAiIGohISAjIQEgICEfA0AgAS0AACAfQYKmgIAAai0AAEcNvAEgH0EDRg27ASAfQQFqIR8gAUEBaiIBIAJHDQALIAAgITYCAAy/AgtByQAhGyABIiMgAkYNvgIgAiAjayAAKAIAIiBqISEgIyEBICAhHwNAIAEtAAAgH0GGpoCAAGotAABHDbsBIB9BAkYNvQEgH0EBaiEfIAFBAWoiASACRw0ACyAAICE2AgAMvgILQcoAIRsgASIjIAJGDb0CIAIgI2sgACgCACIgaiEhICMhASAgIR8DQCABLQAAIB9BiaaAgABqLQAARw26ASAfQQNGDb0BIB9BAWohHyABQQFqIgEgAkcNAAsgACAhNgIADL0CCwNAAkAgAS0AACIbQSBGDQACQAJAAkAgG0G4f2oOCwABvgG+Ab4BvgG+Ab4BvgG+AQK+AQsgAUEBaiEBQcIAIRsMtQILIAFBAWohAUHDACEbDLQCCyABQQFqIQFBxAAhGwyzAgsgAUEBaiIBIAJHDQALQcsAIRsMvAILAkAgASIBIAJGDQAgACABQQFqIgEgAhClgICAABogASEBQQchGwyxAgtBzAAhGwy7AgsDQAJAIAEtAABBkKaAgABqLQAAIhtBAUYNACAbQX5qDgO9Ab4BvwHAAQsgAUEBaiIBIAJHDQALQc0AIRsMugILAkAgASIBIAJGDQAgAUEBaiEBDAMLQc4AIRsMuQILA0ACQCABLQAAQZCogIAAai0AACIbQQFGDQACQCAbQX5qDgTAAcEBwgEAwwELIAEhAUHGACEbDK8CCyABQQFqIgEgAkcNAAtBzwAhGwy4AgsCQCABIgEgAkcNAEHQACEbDLgCCwJAIAEtAAAiG0F2ag4aqAHDAcMBqgHDAcMBwwHDAcMBwwHDAcMBwwHDAcMBwwHDAcMBwwHDAcMBwwG4AcMBwwEAwQELIAFBAWohAQtBBiEbDKsCCwNAAkAgAS0AAEGQqoCAAGotAABBAUYNACABIQEMgAILIAFBAWoiASACRw0AC0HRACEbDLUCCwJAIAEiASACRg0AIAFBAWohAQwDC0HSACEbDLQCCwJAIAEiASACRw0AQdMAIRsMtAILIAFBAWohAQwBCwJAIAEiASACRw0AQdQAIRsMswILIAFBAWohAQtBBCEbDKYCCwJAIAEiHyACRw0AQdUAIRsMsQILIB8hAQJAAkACQCAfLQAAQZCsgIAAai0AAEF/ag4HwgHDAcQBAP4BAQLFAQsgH0EBaiEBDAoLIB9BAWohAQy7AQtBACEbIABBADYCHCAAQfGOgIAANgIQIABBBzYCDCAAIB9BAWo2AhQMsAILAkADQAJAIAEtAABBkKyAgABqLQAAIhtBBEYNAAJAAkAgG0F/ag4HwAHBAcIBxwEABAHHAQsgASEBQckAIRsMqAILIAFBAWohAUHLACEbDKcCCyABQQFqIgEgAkcNAAtB1gAhGwywAgsgAUEBaiEBDLkBCwJAIAEiHyACRw0AQdcAIRsMrwILIB8tAABBL0cNwgEgH0EBaiEBDAYLAkAgASIfIAJHDQBB2AAhGwyuAgsCQCAfLQAAIgFBL0cNACAfQQFqIQFBzAAhGwyjAgsgAUF2aiIEQRZLDcEBQQEgBHRBiYCAAnFFDcEBDJYCCwJAIAEiASACRg0AIAFBAWohAUHNACEbDKICC0HZACEbDKwCCwJAIAEiHyACRw0AQdsAIRsMrAILIB8hAQJAIB8tAABBkLCAgABqLQAAQX9qDgOVAvYBAMIBC0HQACEbDKACCwJAIAEiHyACRg0AA0ACQCAfLQAAQZCugIAAai0AACIBQQNGDQACQCABQX9qDgKXAgDDAQsgHyEBQc4AIRsMogILIB9BAWoiHyACRw0AC0HaACEbDKsCC0HaACEbDKoCCwJAIAEiASACRg0AIABBjICAgAA2AgggACABNgIEIAEhAUHPACEbDJ8CC0HcACEbDKkCCwJAIAEiASACRw0AQd0AIRsMqQILIABBjICAgAA2AgggACABNgIEIAEhAQtBAyEbDJwCCwNAIAEtAABBIEcNjwIgAUEBaiIBIAJHDQALQd4AIRsMpgILAkAgASIBIAJHDQBB3wAhGwymAgsgAS0AAEEgRw28ASABQQFqIQEM2AELAkAgASIEIAJHDQBB4AAhGwylAgsgBC0AAEHMAEcNvwEgBEEBaiEBQRMhGwy9AQtB4QAhGyABIh8gAkYNowIgAiAfayAAKAIAIiNqISAgHyEEICMhAQNAIAQtAAAgAUGQsoCAAGotAABHDb4BIAFBBUYNvAEgAUEBaiEBIARBAWoiBCACRw0ACyAAICA2AgAMowILAkAgASIEIAJHDQBB4gAhGwyjAgsCQAJAIAQtAABBvX9qDgwAvwG/Ab8BvwG/Ab8BvwG/Ab8BvwEBvwELIARBAWohAUHUACEbDJgCCyAEQQFqIQFB1QAhGwyXAgtB4wAhGyABIh8gAkYNoQIgAiAfayAAKAIAIiNqISAgHyEEICMhAQJAA0AgBC0AACABQY2zgIAAai0AAEcNvQEgAUECRg0BIAFBAWohASAEQQFqIgQgAkcNAAsgACAgNgIADKICCyAAQQA2AgAgHyAja0EDaiEBQRAhGwy6AQtB5AAhGyABIh8gAkYNoAIgAiAfayAAKAIAIiNqISAgHyEEICMhAQJAA0AgBC0AACABQZaygIAAai0AAEcNvAEgAUEFRg0BIAFBAWohASAEQQFqIgQgAkcNAAsgACAgNgIADKECCyAAQQA2AgAgHyAja0EGaiEBQRYhGwy5AQtB5QAhGyABIh8gAkYNnwIgAiAfayAAKAIAIiNqISAgHyEEICMhAQJAA0AgBC0AACABQZyygIAAai0AAEcNuwEgAUEDRg0BIAFBAWohASAEQQFqIgQgAkcNAAsgACAgNgIADKACCyAAQQA2AgAgHyAja0EEaiEBQQUhGwy4AQsCQCABIgQgAkcNAEHmACEbDJ8CCyAELQAAQdkARw25ASAEQQFqIQFBCCEbDLcBCwJAIAEiBCACRw0AQecAIRsMngILAkACQCAELQAAQbJ/ag4DALoBAboBCyAEQQFqIQFB2QAhGwyTAgsgBEEBaiEBQdoAIRsMkgILAkAgASIEIAJHDQBB6AAhGwydAgsCQAJAIAQtAABBuH9qDggAuQG5AbkBuQG5AbkBAbkBCyAEQQFqIQFB2AAhGwySAgsgBEEBaiEBQdsAIRsMkQILQekAIRsgASIfIAJGDZsCIAIgH2sgACgCACIjaiEgIB8hBCAjIQECQANAIAQtAAAgAUGgsoCAAGotAABHDbcBIAFBAkYNASABQQFqIQEgBEEBaiIEIAJHDQALIAAgIDYCAAycAgtBACEbIABBADYCACAfICNrQQNqIQEMtAELQeoAIRsgASIfIAJGDZoCIAIgH2sgACgCACIjaiEgIB8hBCAjIQECQANAIAQtAAAgAUGjsoCAAGotAABHDbYBIAFBBEYNASABQQFqIQEgBEEBaiIEIAJHDQALIAAgIDYCAAybAgsgAEEANgIAIB8gI2tBBWohAUEjIRsMswELAkAgASIEIAJHDQBB6wAhGwyaAgsCQAJAIAQtAABBtH9qDggAtgG2AbYBtgG2AbYBAbYBCyAEQQFqIQFB3QAhGwyPAgsgBEEBaiEBQd4AIRsMjgILAkAgASIEIAJHDQBB7AAhGwyZAgsgBC0AAEHFAEcNswEgBEEBaiEBDOQBC0HtACEbIAEiHyACRg2XAiACIB9rIAAoAgAiI2ohICAfIQQgIyEBAkADQCAELQAAIAFBqLKAgABqLQAARw2zASABQQNGDQEgAUEBaiEBIARBAWoiBCACRw0ACyAAICA2AgAMmAILIABBADYCACAfICNrQQRqIQFBLSEbDLABC0HuACEbIAEiHyACRg2WAiACIB9rIAAoAgAiI2ohICAfIQQgIyEBAkADQCAELQAAIAFB8LKAgABqLQAARw2yASABQQhGDQEgAUEBaiEBIARBAWoiBCACRw0ACyAAICA2AgAMlwILIABBADYCACAfICNrQQlqIQFBKSEbDK8BCwJAIAEiASACRw0AQe8AIRsMlgILQQEhGyABLQAAQd8ARw2uASABQQFqIQEM4gELQfAAIRsgASIfIAJGDZQCIAIgH2sgACgCACIjaiEgIB8hBCAjIQEDQCAELQAAIAFBrLKAgABqLQAARw2vASABQQFGDfoBIAFBAWohASAEQQFqIgQgAkcNAAsgACAgNgIADJQCC0HxACEbIAEiHyACRg2TAiACIB9rIAAoAgAiI2ohICAfIQQgIyEBAkADQCAELQAAIAFBrrKAgABqLQAARw2vASABQQJGDQEgAUEBaiEBIARBAWoiBCACRw0ACyAAICA2AgAMlAILIABBADYCACAfICNrQQNqIQFBAiEbDKwBC0HyACEbIAEiHyACRg2SAiACIB9rIAAoAgAiI2ohICAfIQQgIyEBAkADQCAELQAAIAFBkLOAgABqLQAARw2uASABQQFGDQEgAUEBaiEBIARBAWoiBCACRw0ACyAAICA2AgAMkwILIABBADYCACAfICNrQQJqIQFBHyEbDKsBC0HzACEbIAEiHyACRg2RAiACIB9rIAAoAgAiI2ohICAfIQQgIyEBAkADQCAELQAAIAFBkrOAgABqLQAARw2tASABQQFGDQEgAUEBaiEBIARBAWoiBCAC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c3QASW52YWxpZCBtZXRob2QgZm9yIFJUU1AveC54IHJlcXVlc3QARXhwZWN0ZWQgU09VUkNFIG1ldGhvZCBmb3IgSUNFL3gueCByZXF1ZXN0AEludmFsaWQgY2hhciBpbiB1cmwgZnJhZ21lbnQgc3RhcnQARXhwZWN0ZWQgZG90AFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fc3RhdHVzAEludmFsaWQgcmVzcG9uc2Ugc3RhdHVzAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHBhcmFtZXRlcnMAVXNlciBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfaGVhZGVyYCBjYWxsYmFjayBlcnJvcgBgb25fbWVzc2FnZV9iZWdpbmAgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fbWVzc2FnZV9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAVW5leHBlY3RlZCBjaGFyIGluIHVybCBzZXJ2ZXIASW52YWxpZCBoZWFkZXIgdmFsdWUgY2hhcgBJbnZhbGlkIGhlYWRlciBmaWVsZCBjaGFyAEludmFsaWQgbWlub3IgdmVyc2lvbgBJbnZhbGlkIG1ham9yIHZlcnNpb24ARXhwZWN0ZWQgc3BhY2UgYWZ0ZXIgdmVyc2lvbgBFeHBlY3RlZCBDUkxGIGFmdGVyIHZlcnNpb24ASW52YWxpZCBoZWFkZXIgdG9rZW4AU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl91cmwASW52YWxpZCBjaGFyYWN0ZXJzIGluIHVybABVbmV4cGVjdGVkIHN0YXJ0IGNoYXIgaW4gdXJsAERvdWJsZSBAIGluIHVybABFbXB0eSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXJhY3RlciBpbiBDb250ZW50LUxlbmd0aABEdXBsaWNhdGUgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyIGluIHVybCBwYXRoAENvbnRlbnQtTGVuZ3RoIGNhbid0IGJlIHByZXNlbnQgd2l0aCBUcmFuc2Zlci1FbmNvZGluZwBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBzaXplAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25faGVhZGVyX3ZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgTEYgYWZ0ZXIgaGVhZGVyIHZhbHVlAFBhdXNlZCBieSBvbl9oZWFkZXJzX2NvbXBsZXRlAEludmFsaWQgRU9GIHN0YXRlAG9uX2NodW5rX2hlYWRlciBwYXVzZQBvbl9tZXNzYWdlX2JlZ2luIHBhdXNlAG9uX2NodW5rX2NvbXBsZXRlIHBhdXNlAG9uX21lc3NhZ2VfY29tcGxldGUgcGF1c2UAUGF1c2Ugb24gQ09OTkVDVC9VcGdyYWRlAFBhdXNlIG9uIFBSSS9VcGdyYWRlAEV4cGVjdGVkIEhUVFAvMiBDb25uZWN0aW9uIFByZWZhY2UARXhwZWN0ZWQgc3BhY2UgYWZ0ZXIgbWV0aG9kAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25faGVhZGVyX2ZpZWxkAFBhdXNlZABJbnZhbGlkIHdvcmQgZW5jb3VudGVyZWQASW52YWxpZCBtZXRob2QgZW5jb3VudGVyZWQAVW5leHBlY3RlZCBjaGFyIGluIHVybCBzY2hlbWEAUmVxdWVzdCBoYXMgaW52YWxpZCBgVHJhbnNmZXItRW5jb2RpbmdgAE1LQUNUSVZJVFkAQ09QWQBOT1RJRlkAUExBWQBQVVQAQ0hFQ0tPVVQAUE9TVABSRVBPUlQASFBFX0lOVkFMSURfQ09OU1RBTlQAR0VUAEhQRV9TVFJJQ1QAUkVESVJFQ1QAQ09OTkVDVABIUEVfSU5WQUxJRF9TVEFUVVMAT1BUSU9OUwBTRVRfUEFSQU1FVEVSAEdFVF9QQVJBTUVURVIASFBFX1VTRVIASFBFX0NCX0NIVU5LX0hFQURFUgBNS0NBTEVOREFSAFNFVFVQAFRFQVJET1dOAEhQRV9DTE9TRURfQ09OTkVDVElPTgBIUEVfSU5WQUxJRF9WRVJTSU9OAEhQRV9DQl9NRVNTQUdFX0JFR0lOAEhQRV9JTlZBTElEX0hFQURFUl9UT0tFTgBIUEVfSU5WQUxJRF9VUkwATUtDT0wAQUNMAEhQRV9JTlRFUk5BTABIUEVfT0sAVU5MSU5LAFVOTE9DSwBQUkkASFBFX0lOVkFMSURfQ09OVEVOVF9MRU5HVEgASFBFX1VORVhQRUNURURfQ09OVEVOVF9MRU5HVEgARkxVU0gAUFJPUFBBVENIAE0tU0VBUkNIAEhQRV9JTlZBTElEX1RSQU5TRkVSX0VOQ09ESU5HAEV4cGVjdGVkIENSTEYASFBFX0lOVkFMSURfQ0hVTktfU0laRQBNT1ZFAEhQRV9DQl9IRUFERVJTX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19DT01QTEVURQBIUEVfQ0JfTUVTU0FHRV9DT01QTEVURQBERUxFVEUASFBFX0lOVkFMSURfRU9GX1NUQVRFAFBBVVNFAFBVUkdFAE1FUkdFAEhQRV9QQVVTRURfVVBHUkFERQBIUEVfUEFVU0VEX0gyX1VQR1JBREUAU09VUkNFAEFOTk9VTkNFAFRSQUNFAERFU0NSSUJFAFVOU1VCU0NSSUJFAFJFQ09SRABIUEVfSU5WQUxJRF9NRVRIT0QAUFJPUEZJTkQAVU5CSU5EAFJFQklORABIUEVfTEZfRVhQRUNURUQASFBFX1BBVVNFRABIRUFEAEV4cGVjdGVkIEhUVFAvAIwLAAB/CwAAgwoAADkNAADACwAADQsAAA8NAABlCwAAagoAACMLAABMCwAApQsAACMMAACfCgAAjAwAAPcLAAA3CwAAPwwAAG0MAADfCgAAVwwAAEkNAAC0DAAAxwwAANYKAACFDAAAfwoAAFQNAABeCgAAUQoAAJcKAACyCgAA7QwAAEAKAACcCwAAdQsAADoMAAAiDQAA5AsAAPALAACaCwAANA0AADINAAArDQAAewsAAGMKAAA1CgAAVQoAAK4MAADuCwAARQoAAP4MAAD8DAAA6AsAAKgMAADzCgAAlQsAAJMLAADdDAAAoQsAAPMMAADkDAAA/goAAEwKAACiDAAABAsAAMgKAAC6CgAAjgoAAAgNAADeCwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAIAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAWxvc2VlZXAtYWxpdmUAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQEBAQEBAQECAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAWNodW5rZWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAEBAQEBAAABAQABAQABAQEBAQEBAQEBAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZWN0aW9uZW50LWxlbmd0aG9ucm94eS1jb25uZWN0aW9uAAAAAAAAAAAAAAAAAAAAcmFuc2Zlci1lbmNvZGluZ3BncmFkZQ0KDQoNClNNDQoNClRUUC9DRS9UU1AvAAAAAAAAAAAAAAAAAQIAAQMAAAAAAAAAAAAAAAAAAAAAAAAEAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAECAAEDAAAAAAAAAAAAAAAAAAAAAAAABAEBBQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAAABAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAEAAAIAAAAAAAAAAAAAAAAAAAAAAAADBAAABAQEBAQEBAQEBAQFBAQEBAQEBAQEBAQEAAQABgcEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAAEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAACAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATk9VTkNFRUNLT1VUTkVDVEVURUNSSUJFTFVTSEVURUFEU0VBUkNIUkdFQ1RJVklUWUxFTkRBUlZFT1RJRllQVElPTlNDSFNFQVlTVEFUQ0hHRU9SRElSRUNUT1JUUkNIUEFSQU1FVEVSVVJDRUJTQ1JJQkVBUkRPV05BQ0VJTkROS0NLVUJTQ1JJQkVIVFRQL0FEVFAv";
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/llhttp_simd.wasm.js
var require_llhttp_simd_wasm = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/llhttp/llhttp_simd.wasm.js"(exports, module2) {
    module2.exports = "AGFzbQEAAAABMAhgAX8Bf2ADf39/AX9gBH9/f38Bf2AAAGADf39/AGABfwBgAn9/AGAGf39/f39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQACA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAzk4AwMEAAAFAAAAAAAABQEFAAUFBQAABgAAAAYGAQEBAQEBAQEBAQEBAQEBAQABAAABAQcAAAUFAAMEBQFwAQ4OBQMBAAIGCAF/AUGgtwQLB/UEHwZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAJGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAKGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQA1DGxsaHR0cF9hbGxvYwAMBm1hbGxvYwA6C2xsaHR0cF9mcmVlAA0EZnJlZQA8D2xsaHR0cF9nZXRfdHlwZQAOFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAPFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAQEWxsaHR0cF9nZXRfbWV0aG9kABEWbGxodHRwX2dldF9zdGF0dXNfY29kZQASEmxsaHR0cF9nZXRfdXBncmFkZQATDGxsaHR0cF9yZXNldAAUDmxsaHR0cF9leGVjdXRlABUUbGxodHRwX3NldHRpbmdzX2luaXQAFg1sbGh0dHBfZmluaXNoABcMbGxodHRwX3BhdXNlABgNbGxodHRwX3Jlc3VtZQAZG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAaEGxsaHR0cF9nZXRfZXJybm8AGxdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAcF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uAB0UbGxodHRwX2dldF9lcnJvcl9wb3MAHhFsbGh0dHBfZXJybm9fbmFtZQAfEmxsaHR0cF9tZXRob2RfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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C0GcASEbDA0LQZ4BIRsMDAtBoAEhGwwLC0GfASEbDAoLQaEBIRsMCQtBogEhGwwIC0GjASEbDAcLQaQBIRsMBgtBpQEhGwwFC0GmASEbDAQLQacBIRsMAwtBqAEhGwwCC0GpASEbDAELQa8BIRsLA0ACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIBsO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aG9kIGZvciBSVFNQL3gueCByZXF1ZXN0AEV4cGVjdGVkIFNPVVJDRSBtZXRob2QgZm9yIElDRS94LnggcmVxdWVzdABJbnZhbGlkIGNoYXIgaW4gdXJsIGZyYWdtZW50IHN0YXJ0AEV4cGVjdGVkIGRvdABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3N0YXR1cwBJbnZhbGlkIHJlc3BvbnNlIHN0YXR1cwBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBwYXJhbWV0ZXJzAFVzZXIgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2hlYWRlcmAgY2FsbGJhY2sgZXJyb3IAYG9uX21lc3NhZ2VfYmVnaW5gIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX21lc3NhZ2VfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2VydmVyAEludmFsaWQgaGVhZGVyIHZhbHVlIGNoYXIASW52YWxpZCBoZWFkZXIgZmllbGQgY2hhcgBJbnZhbGlkIG1pbm9yIHZlcnNpb24ASW52YWxpZCBtYWpvciB2ZXJzaW9uAEV4cGVjdGVkIHNwYWNlIGFmdGVyIHZlcnNpb24ARXhwZWN0ZWQgQ1JMRiBhZnRlciB2ZXJzaW9uAEludmFsaWQgaGVhZGVyIHRva2VuAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fdXJsAEludmFsaWQgY2hhcmFjdGVycyBpbiB1cmwAVW5leHBlY3RlZCBzdGFydCBjaGFyIGluIHVybABEb3VibGUgQCBpbiB1cmwARW1wdHkgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyYWN0ZXIgaW4gQ29udGVudC1MZW5ndGgARHVwbGljYXRlIENvbnRlbnQtTGVuZ3RoAEludmFsaWQgY2hhciBpbiB1cmwgcGF0aABDb250ZW50LUxlbmd0aCBjYW4ndCBiZSBwcmVzZW50IHdpdGggVHJhbnNmZXItRW5jb2RpbmcASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgc2l6ZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl92YWx1ZQBNaXNzaW5nIGV4cGVjdGVkIExGIGFmdGVyIGhlYWRlciB2YWx1ZQBQYXVzZWQgYnkgb25faGVhZGVyc19jb21wbGV0ZQBJbnZhbGlkIEVPRiBzdGF0ZQBvbl9jaHVua19oZWFkZXIgcGF1c2UAb25fbWVzc2FnZV9iZWdpbiBwYXVzZQBvbl9jaHVua19jb21wbGV0ZSBwYXVzZQBvbl9tZXNzYWdlX2NvbXBsZXRlIHBhdXNlAFBhdXNlIG9uIENPTk5FQ1QvVXBncmFkZQBQYXVzZSBvbiBQUkkvVXBncmFkZQBFeHBlY3RlZCBIVFRQLzIgQ29ubmVjdGlvbiBQcmVmYWNlAEV4cGVjdGVkIHNwYWNlIGFmdGVyIG1ldGhvZABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl9maWVsZABQYXVzZWQASW52YWxpZCB3b3JkIGVuY291bnRlcmVkAEludmFsaWQgbWV0aG9kIGVuY291bnRlcmVkAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2NoZW1hAFJlcXVlc3QgaGFzIGludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYABNS0FDVElWSVRZAENPUFkATk9USUZZAFBMQVkAUFVUAENIRUNLT1VUAFBPU1QAUkVQT1JUAEhQRV9JTlZBTElEX0NPTlNUQU5UAEdFVABIUEVfU1RSSUNUAFJFRElSRUNUAENPTk5FQ1QASFBFX0lOVkFMSURfU1RBVFVTAE9QVElPTlMAU0VUX1BBUkFNRVRFUgBHRVRfUEFSQU1FVEVSAEhQRV9VU0VSAEhQRV9DQl9DSFVOS19IRUFERVIATUtDQUxFTkRBUgBTRVRVUABURUFSRE9XTgBIUEVfQ0xPU0VEX0NPTk5FQ1RJT04ASFBFX0lOVkFMSURfVkVSU0lPTgBIUEVfQ0JfTUVTU0FHRV9CRUdJTgBIUEVfSU5WQUxJRF9IRUFERVJfVE9LRU4ASFBFX0lOVkFMSURfVVJMAE1LQ09MAEFDTABIUEVfSU5URVJOQUwASFBFX09LAFVOTElOSwBVTkxPQ0sAUFJJAEhQRV9JTlZBTElEX0NPTlRFTlRfTEVOR1RIAEhQRV9VTkVYUEVDVEVEX0NPTlRFTlRfTEVOR1RIAEZMVVNIAFBS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bmdwZ3JhZGUNCg0KDQpTTQ0KDQpUVFAvQ0UvVFNQLwAAAAAAAAAAAAAAAAECAAEDAAAAAAAAAAAAAAAAAAAAAAAABAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAABAgABAwAAAAAAAAAAAAAAAAAAAAAAAAQBAQUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAABAAACAAAAAAAAAAAAAAAAAAAAAAAAAwQAAAQEBAQEBAQEBAQEBQQEBAQEBAQEBAQEBAAEAAYHBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQABAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAEAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAgAAAAACAAAAAAAAAAAAAAAAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE5PVU5DRUVDS09VVE5FQ1RFVEVDUklCRUxVU0hFVEVBRFNFQVJDSFJHRUNUSVZJVFlMRU5EQVJWRU9USUZZUFRJT05TQ0hTRUFZU1RBVENIR0VPUkRJUkVDVE9SVFJDSFBBUkFNRVRFUlVSQ0VCU0NSSUJFQVJET1dOQUNFSU5ETktDS1VCU0NSSUJFSFRUUC9BRFRQLw==";
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/client.js
var require_client = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/client.js"(exports, module2) {
    "use strict";
    var assert = require("assert");
    var net = require("net");
    var util = require_util();
    var Request = require_request2();
    var DispatcherBase = require_dispatcher_base();
    var RedirectHandler = require_redirect();
    var {
      RequestContentLengthMismatchError,
      ResponseContentLengthMismatchError,
      InvalidArgumentError: InvalidArgumentError2,
      RequestAbortedError,
      HeadersTimeoutError,
      HeadersOverflowError,
      SocketError,
      InformationalError,
      BodyTimeoutError,
      HTTPParserError
    } = require_errors();
    var buildConnector = require_connect();
    var {
      kUrl,
      kReset,
      kServerName,
      kClient,
      kBusy,
      kParser,
      kConnect,
      kBlocking,
      kResuming,
      kRunning,
      kPending,
      kSize,
      kWriting,
      kQueue,
      kConnected,
      kConnecting,
      kNeedDrain,
      kNoRef,
      kKeepAliveDefaultTimeout,
      kHostHeader,
      kPendingIdx,
      kRunningIdx,
      kError,
      kPipelining,
      kSocket,
      kKeepAliveTimeoutValue,
      kMaxHeadersSize,
      kKeepAliveMaxTimeout,
      kKeepAliveTimeoutThreshold,
      kHeadersTimeout,
      kBodyTimeout,
      kStrictContentLength,
      kConnector,
      kMaxRedirections,
      kMaxRequests,
      kCounter,
      kClose,
      kDestroy,
      kDispatch
    } = require_symbols();
    var kClosedResolve = Symbol("kClosedResolve");
    var channels = {};
    try {
      const diagnosticsChannel = require("diagnostics_channel");
      channels.sendHeaders = diagnosticsChannel.channel("undici:client:sendHeaders");
      channels.beforeConnect = diagnosticsChannel.channel("undici:client:beforeConnect");
      channels.connectError = diagnosticsChannel.channel("undici:client:connectError");
      channels.connected = diagnosticsChannel.channel("undici:client:connected");
    } catch {
      channels.sendHeaders = { hasSubscribers: false };
      channels.beforeConnect = { hasSubscribers: false };
      channels.connectError = { hasSubscribers: false };
      channels.connected = { hasSubscribers: false };
    }
    var Client = class extends DispatcherBase {
      constructor(url, {
        maxHeaderSize,
        headersTimeout,
        socketTimeout,
        requestTimeout,
        connectTimeout,
        bodyTimeout,
        idleTimeout,
        keepAlive,
        keepAliveTimeout,
        maxKeepAliveTimeout,
        keepAliveMaxTimeout,
        keepAliveTimeoutThreshold,
        socketPath,
        pipelining,
        tls,
        strictContentLength,
        maxCachedSessions,
        maxRedirections,
        connect: connect2,
        maxRequestsPerClient
      } = {}) {
        super();
        if (keepAlive !== void 0) {
          throw new InvalidArgumentError2("unsupported keepAlive, use pipelining=0 instead");
        }
        if (socketTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported socketTimeout, use headersTimeout & bodyTimeout instead");
        }
        if (requestTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported requestTimeout, use headersTimeout & bodyTimeout instead");
        }
        if (idleTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported idleTimeout, use keepAliveTimeout instead");
        }
        if (maxKeepAliveTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead");
        }
        if (maxHeaderSize != null && !Number.isFinite(maxHeaderSize)) {
          throw new InvalidArgumentError2("invalid maxHeaderSize");
        }
        if (socketPath != null && typeof socketPath !== "string") {
          throw new InvalidArgumentError2("invalid socketPath");
        }
        if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) {
          throw new InvalidArgumentError2("invalid connectTimeout");
        }
        if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) {
          throw new InvalidArgumentError2("invalid keepAliveTimeout");
        }
        if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) {
          throw new InvalidArgumentError2("invalid keepAliveMaxTimeout");
        }
        if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
          throw new InvalidArgumentError2("invalid keepAliveTimeoutThreshold");
        }
        if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
          throw new InvalidArgumentError2("headersTimeout must be a positive integer or zero");
        }
        if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
          throw new InvalidArgumentError2("bodyTimeout must be a positive integer or zero");
        }
        if (connect2 != null && typeof connect2 !== "function" && typeof connect2 !== "object") {
          throw new InvalidArgumentError2("connect must be a function or an object");
        }
        if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
          throw new InvalidArgumentError2("maxRedirections must be a positive number");
        }
        if (maxRequestsPerClient != null && (!Number.isInteger(maxRequestsPerClient) || maxRequestsPerClient < 0)) {
          throw new InvalidArgumentError2("maxRequestsPerClient must be a positive number");
        }
        if (typeof connect2 !== "function") {
          connect2 = buildConnector({
            ...tls,
            maxCachedSessions,
            socketPath,
            timeout: connectTimeout,
            ...connect2
          });
        }
        this[kUrl] = util.parseOrigin(url);
        this[kConnector] = connect2;
        this[kSocket] = null;
        this[kPipelining] = pipelining != null ? pipelining : 1;
        this[kMaxHeadersSize] = maxHeaderSize || 16384;
        this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout;
        this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 6e5 : keepAliveMaxTimeout;
        this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 1e3 : keepAliveTimeoutThreshold;
        this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout];
        this[kServerName] = null;
        this[kResuming] = 0;
        this[kNeedDrain] = 0;
        this[kHostHeader] = `host: ${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ""}\r
`;
        this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 3e4;
        this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 3e4;
        this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength;
        this[kMaxRedirections] = maxRedirections;
        this[kMaxRequests] = maxRequestsPerClient;
        this[kClosedResolve] = null;
        this[kQueue] = [];
        this[kRunningIdx] = 0;
        this[kPendingIdx] = 0;
      }
      get pipelining() {
        return this[kPipelining];
      }
      set pipelining(value) {
        this[kPipelining] = value;
        resume(this, true);
      }
      get [kPending]() {
        return this[kQueue].length - this[kPendingIdx];
      }
      get [kRunning]() {
        return this[kPendingIdx] - this[kRunningIdx];
      }
      get [kSize]() {
        return this[kQueue].length - this[kRunningIdx];
      }
      get [kConnected]() {
        return !!this[kSocket] && !this[kConnecting] && !this[kSocket].destroyed;
      }
      get [kBusy]() {
        const socket = this[kSocket];
        return socket && (socket[kReset] || socket[kWriting] || socket[kBlocking]) || this[kSize] >= (this[kPipelining] || 1) || this[kPending] > 0;
      }
      [kConnect](cb) {
        connect(this);
        this.once("connect", cb);
      }
      [kDispatch](opts, handler) {
        const { maxRedirections = this[kMaxRedirections] } = opts;
        if (maxRedirections) {
          handler = new RedirectHandler(this, maxRedirections, opts, handler);
        }
        const origin = opts.origin || this[kUrl].origin;
        const request = new Request(origin, opts, handler);
        this[kQueue].push(request);
        if (this[kResuming]) {
        } else if (util.bodyLength(request.body) == null && util.isIterable(request.body)) {
          this[kResuming] = 1;
          process.nextTick(resume, this);
        } else {
          resume(this, true);
        }
        if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) {
          this[kNeedDrain] = 2;
        }
        return this[kNeedDrain] < 2;
      }
      async [kClose]() {
        return new Promise((resolve) => {
          if (!this[kSize]) {
            this.destroy(resolve);
          } else {
            this[kClosedResolve] = resolve;
          }
        });
      }
      async [kDestroy](err) {
        return new Promise((resolve) => {
          const requests = this[kQueue].splice(this[kPendingIdx]);
          for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            errorRequest(this, request, err);
          }
          const callback = /* @__PURE__ */ __name(() => {
            if (this[kClosedResolve]) {
              this[kClosedResolve]();
              this[kClosedResolve] = null;
            }
            resolve();
          }, "callback");
          if (!this[kSocket]) {
            queueMicrotask(callback);
          } else {
            util.destroy(this[kSocket].on("close", callback), err);
          }
          resume(this);
        });
      }
    };
    __name(Client, "Client");
    var constants2 = require_constants3();
    var EMPTY_BUF = Buffer.alloc(0);
    async function lazyllhttp() {
      const llhttpWasmData = process.env.JEST_WORKER_ID ? require_llhttp_wasm() : void 0;
      let mod;
      try {
        mod = await WebAssembly.compile(Buffer.from(require_llhttp_simd_wasm(), "base64"));
      } catch (e) {
        mod = await WebAssembly.compile(Buffer.from(llhttpWasmData || require_llhttp_wasm(), "base64"));
      }
      return await WebAssembly.instantiate(mod, {
        env: {
          wasm_on_url: (p, at, len) => {
            return 0;
          },
          wasm_on_status: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onStatus(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_message_begin: (p) => {
            assert.strictEqual(currentParser.ptr, p);
            return currentParser.onMessageBegin() || 0;
          },
          wasm_on_header_field: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onHeaderField(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_header_value: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onHeaderValue(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
            assert.strictEqual(currentParser.ptr, p);
            return currentParser.onHeadersComplete(statusCode, Boolean(upgrade), Boolean(shouldKeepAlive)) || 0;
          },
          wasm_on_body: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onBody(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_message_complete: (p) => {
            assert.strictEqual(currentParser.ptr, p);
            return currentParser.onMessageComplete() || 0;
          }
        }
      });
    }
    __name(lazyllhttp, "lazyllhttp");
    var llhttpInstance = null;
    var llhttpPromise = lazyllhttp().catch(() => {
    });
    var currentParser = null;
    var currentBufferRef = null;
    var currentBufferSize = 0;
    var currentBufferPtr = null;
    var TIMEOUT_HEADERS = 1;
    var TIMEOUT_BODY = 2;
    var TIMEOUT_IDLE = 3;
    var Parser = class {
      constructor(client, socket, { exports: exports2 }) {
        assert(Number.isFinite(client[kMaxHeadersSize]) && client[kMaxHeadersSize] > 0);
        this.llhttp = exports2;
        this.ptr = this.llhttp.llhttp_alloc(constants2.TYPE.RESPONSE);
        this.client = client;
        this.socket = socket;
        this.timeout = null;
        this.timeoutValue = null;
        this.timeoutType = null;
        this.statusCode = null;
        this.statusText = "";
        this.upgrade = false;
        this.headers = [];
        this.headersSize = 0;
        this.headersMaxSize = client[kMaxHeadersSize];
        this.shouldKeepAlive = false;
        this.paused = false;
        this.resume = this.resume.bind(this);
        this.bytesRead = 0;
        this.keepAlive = "";
        this.contentLength = "";
      }
      setTimeout(value, type) {
        this.timeoutType = type;
        if (value !== this.timeoutValue) {
          clearTimeout(this.timeout);
          if (value) {
            this.timeout = setTimeout(onParserTimeout, value, this);
            if (this.timeout.unref) {
              this.timeout.unref();
            }
          } else {
            this.timeout = null;
          }
          this.timeoutValue = value;
        } else if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
      }
      resume() {
        if (this.socket.destroyed || !this.paused) {
          return;
        }
        assert(this.ptr != null);
        assert(currentParser == null);
        this.llhttp.llhttp_resume(this.ptr);
        assert(this.timeoutType === TIMEOUT_BODY);
        if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        this.paused = false;
        this.execute(this.socket.read() || EMPTY_BUF);
        this.readMore();
      }
      readMore() {
        while (!this.paused && this.ptr) {
          const chunk = this.socket.read();
          if (chunk === null) {
            break;
          }
          this.execute(chunk);
        }
      }
      execute(data) {
        assert(this.ptr != null);
        assert(currentParser == null);
        assert(!this.paused);
        const { socket, llhttp } = this;
        if (data.length > currentBufferSize) {
          if (currentBufferPtr) {
            llhttp.free(currentBufferPtr);
          }
          currentBufferSize = Math.ceil(data.length / 4096) * 4096;
          currentBufferPtr = llhttp.malloc(currentBufferSize);
        }
        new Uint8Array(llhttp.memory.buffer, currentBufferPtr, currentBufferSize).set(data);
        try {
          let ret;
          try {
            currentBufferRef = data;
            currentParser = this;
            ret = llhttp.llhttp_execute(this.ptr, currentBufferPtr, data.length);
          } catch (err) {
            throw err;
          } finally {
            currentParser = null;
            currentBufferRef = null;
          }
          const offset = llhttp.llhttp_get_error_pos(this.ptr) - currentBufferPtr;
          if (ret === constants2.ERROR.PAUSED_UPGRADE) {
            this.onUpgrade(data.slice(offset));
          } else if (ret === constants2.ERROR.PAUSED) {
            this.paused = true;
            socket.unshift(data.slice(offset));
          } else if (ret !== constants2.ERROR.OK) {
            const ptr = llhttp.llhttp_get_error_reason(this.ptr);
            let message = "";
            if (ptr) {
              const len = new Uint8Array(llhttp.memory.buffer, ptr).indexOf(0);
              message = Buffer.from(llhttp.memory.buffer, ptr, len).toString();
            }
            throw new HTTPParserError(message, constants2.ERROR[ret], data.slice(offset));
          }
        } catch (err) {
          util.destroy(socket, err);
        }
      }
      finish() {
        try {
          try {
            currentParser = this;
          } finally {
            currentParser = null;
          }
        } catch (err) {
          util.destroy(this.socket, err);
        }
      }
      destroy() {
        assert(this.ptr != null);
        assert(currentParser == null);
        this.llhttp.llhttp_free(this.ptr);
        this.ptr = null;
        clearTimeout(this.timeout);
        this.timeout = null;
        this.timeoutValue = null;
        this.timeoutType = null;
        this.paused = false;
      }
      onStatus(buf) {
        this.statusText = buf.toString();
      }
      onMessageBegin() {
        const { socket, client } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        if (!request) {
          return -1;
        }
      }
      onHeaderField(buf) {
        const len = this.headers.length;
        if ((len & 1) === 0) {
          this.headers.push(buf);
        } else {
          this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
        }
        this.trackHeader(buf.length);
      }
      onHeaderValue(buf) {
        let len = this.headers.length;
        if ((len & 1) === 1) {
          this.headers.push(buf);
          len += 1;
        } else {
          this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
        }
        const key = this.headers[len - 2];
        if (key.length === 10 && key.toString().toLowerCase() === "keep-alive") {
          this.keepAlive += buf.toString();
        } else if (key.length === 14 && key.toString().toLowerCase() === "content-length") {
          this.contentLength += buf.toString();
        }
        this.trackHeader(buf.length);
      }
      trackHeader(len) {
        this.headersSize += len;
        if (this.headersSize >= this.headersMaxSize) {
          util.destroy(this.socket, new HeadersOverflowError());
        }
      }
      onUpgrade(head) {
        const { upgrade, client, socket, headers, statusCode } = this;
        assert(upgrade);
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert(!socket.destroyed);
        assert(socket === client[kSocket]);
        assert(!this.paused);
        assert(request.upgrade || request.method === "CONNECT");
        this.statusCode = null;
        this.statusText = "";
        this.shouldKeepAlive = null;
        assert(this.headers.length % 2 === 0);
        this.headers = [];
        this.headersSize = 0;
        socket.unshift(head);
        socket[kParser].destroy();
        socket[kParser] = null;
        socket[kClient] = null;
        socket[kError] = null;
        socket.removeListener("error", onSocketError).removeListener("readable", onSocketReadable).removeListener("end", onSocketEnd).removeListener("close", onSocketClose);
        client[kSocket] = null;
        client[kQueue][client[kRunningIdx]++] = null;
        client.emit("disconnect", client[kUrl], [client], new InformationalError("upgrade"));
        try {
          request.onUpgrade(statusCode, headers, socket);
        } catch (err) {
          util.destroy(socket, err);
        }
        resume(client);
      }
      onHeadersComplete(statusCode, upgrade, shouldKeepAlive) {
        const { client, socket, headers, statusText } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        if (!request) {
          return -1;
        }
        assert(!this.upgrade);
        assert(this.statusCode < 200);
        if (statusCode === 100) {
          util.destroy(socket, new SocketError("bad response", util.getSocketInfo(socket)));
          return -1;
        }
        if (upgrade && !request.upgrade) {
          util.destroy(socket, new SocketError("bad upgrade", util.getSocketInfo(socket)));
          return -1;
        }
        assert.strictEqual(this.timeoutType, TIMEOUT_HEADERS);
        this.statusCode = statusCode;
        this.shouldKeepAlive = shouldKeepAlive;
        if (this.statusCode >= 200) {
          const bodyTimeout = request.bodyTimeout != null ? request.bodyTimeout : client[kBodyTimeout];
          this.setTimeout(bodyTimeout, TIMEOUT_BODY);
        } else if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        if (request.method === "CONNECT" && statusCode >= 200 && statusCode < 300) {
          assert(client[kRunning] === 1);
          this.upgrade = true;
          return 2;
        }
        if (upgrade) {
          assert(client[kRunning] === 1);
          this.upgrade = true;
          return 2;
        }
        assert(this.headers.length % 2 === 0);
        this.headers = [];
        this.headersSize = 0;
        if (shouldKeepAlive && client[kPipelining]) {
          const keepAliveTimeout = this.keepAlive ? util.parseKeepAliveTimeout(this.keepAlive) : null;
          if (keepAliveTimeout != null) {
            const timeout = Math.min(keepAliveTimeout - client[kKeepAliveTimeoutThreshold], client[kKeepAliveMaxTimeout]);
            if (timeout <= 0) {
              socket[kReset] = true;
            } else {
              client[kKeepAliveTimeoutValue] = timeout;
            }
          } else {
            client[kKeepAliveTimeoutValue] = client[kKeepAliveDefaultTimeout];
          }
        } else {
          socket[kReset] = true;
        }
        let pause;
        try {
          pause = request.onHeaders(statusCode, headers, this.resume, statusText) === false;
        } catch (err) {
          util.destroy(socket, err);
          return -1;
        }
        if (request.method === "HEAD") {
          assert(socket[kReset]);
          return 1;
        }
        if (statusCode < 200) {
          return 1;
        }
        if (socket[kBlocking]) {
          socket[kBlocking] = false;
          resume(client);
        }
        return pause ? constants2.ERROR.PAUSED : 0;
      }
      onBody(buf) {
        const { client, socket, statusCode } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert.strictEqual(this.timeoutType, TIMEOUT_BODY);
        if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        assert(statusCode >= 200);
        this.bytesRead += buf.length;
        try {
          if (request.onData(buf) === false) {
            return constants2.ERROR.PAUSED;
          }
        } catch (err) {
          util.destroy(socket, err);
          return -1;
        }
      }
      onMessageComplete() {
        const { client, socket, statusCode, upgrade, headers, contentLength, bytesRead, shouldKeepAlive } = this;
        if (socket.destroyed && (!statusCode || shouldKeepAlive)) {
          return -1;
        }
        if (upgrade) {
          return;
        }
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert(statusCode >= 100);
        this.statusCode = null;
        this.statusText = "";
        this.bytesRead = 0;
        this.contentLength = "";
        this.keepAlive = "";
        assert(this.headers.length % 2 === 0);
        this.headers = [];
        this.headersSize = 0;
        if (statusCode < 200) {
          return;
        }
        if (request.method !== "HEAD" && contentLength && bytesRead !== parseInt(contentLength, 10)) {
          util.destroy(socket, new ResponseContentLengthMismatchError());
          return -1;
        }
        try {
          request.onComplete(headers);
        } catch (err) {
          errorRequest(client, request, err);
        }
        client[kQueue][client[kRunningIdx]++] = null;
        if (socket[kWriting]) {
          assert.strictEqual(client[kRunning], 0);
          util.destroy(socket, new InformationalError("reset"));
          return constants2.ERROR.PAUSED;
        } else if (!shouldKeepAlive) {
          util.destroy(socket, new InformationalError("reset"));
          return constants2.ERROR.PAUSED;
        } else if (socket[kReset] && client[kRunning] === 0) {
          util.destroy(socket, new InformationalError("reset"));
          return constants2.ERROR.PAUSED;
        } else if (client[kPipelining] === 1) {
          setImmediate(resume, client);
        } else {
          resume(client);
        }
      }
    };
    __name(Parser, "Parser");
    function onParserTimeout(parser) {
      const { socket, timeoutType, client } = parser;
      if (timeoutType === TIMEOUT_HEADERS) {
        if (!socket[kWriting]) {
          assert(!parser.paused, "cannot be paused while waiting for headers");
          util.destroy(socket, new HeadersTimeoutError());
        }
      } else if (timeoutType === TIMEOUT_BODY) {
        if (!parser.paused) {
          util.destroy(socket, new BodyTimeoutError());
        }
      } else if (timeoutType === TIMEOUT_IDLE) {
        assert(client[kRunning] === 0 && client[kKeepAliveTimeoutValue]);
        util.destroy(socket, new InformationalError("socket idle timeout"));
      }
    }
    __name(onParserTimeout, "onParserTimeout");
    function onSocketReadable() {
      const { [kParser]: parser } = this;
      parser.readMore();
    }
    __name(onSocketReadable, "onSocketReadable");
    function onSocketError(err) {
      const { [kParser]: parser } = this;
      assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
      if (err.code === "ECONNRESET" && parser.statusCode && !parser.shouldKeepAlive) {
        parser.finish();
        return;
      }
      this[kError] = err;
      onError(this[kClient], err);
    }
    __name(onSocketError, "onSocketError");
    function onError(client, err) {
      if (client[kRunning] === 0 && err.code !== "UND_ERR_INFO" && err.code !== "UND_ERR_SOCKET") {
        assert(client[kPendingIdx] === client[kRunningIdx]);
        const requests = client[kQueue].splice(client[kRunningIdx]);
        for (let i = 0; i < requests.length; i++) {
          const request = requests[i];
          errorRequest(client, request, err);
        }
        assert(client[kSize] === 0);
      }
    }
    __name(onError, "onError");
    function onSocketEnd() {
      const { [kParser]: parser } = this;
      if (parser.statusCode && !parser.shouldKeepAlive) {
        parser.finish();
        return;
      }
      util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
    }
    __name(onSocketEnd, "onSocketEnd");
    function onSocketClose() {
      const { [kClient]: client } = this;
      this[kParser].destroy();
      this[kParser] = null;
      const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
      client[kSocket] = null;
      if (client.destroyed) {
        assert(client[kPending] === 0);
        const requests = client[kQueue].splice(client[kRunningIdx]);
        for (let i = 0; i < requests.length; i++) {
          const request = requests[i];
          errorRequest(client, request, err);
        }
      } else if (client[kRunning] > 0 && err.code !== "UND_ERR_INFO") {
        const request = client[kQueue][client[kRunningIdx]];
        client[kQueue][client[kRunningIdx]++] = null;
        errorRequest(client, request, err);
      }
      client[kPendingIdx] = client[kRunningIdx];
      assert(client[kRunning] === 0);
      client.emit("disconnect", client[kUrl], [client], err);
      resume(client);
    }
    __name(onSocketClose, "onSocketClose");
    async function connect(client) {
      assert(!client[kConnecting]);
      assert(!client[kSocket]);
      let { host, hostname, protocol, port } = client[kUrl];
      if (hostname[0] === "[") {
        const idx = hostname.indexOf("]");
        assert(idx !== -1);
        const ip = hostname.substr(1, idx - 1);
        assert(net.isIP(ip));
        hostname = ip;
      }
      client[kConnecting] = true;
      if (channels.beforeConnect.hasSubscribers) {
        channels.beforeConnect.publish({
          connectParams: {
            host,
            hostname,
            protocol,
            port,
            servername: client[kServerName]
          },
          connector: client[kConnector]
        });
      }
      try {
        const socket = await new Promise((resolve, reject) => {
          client[kConnector]({
            host,
            hostname,
            protocol,
            port,
            servername: client[kServerName]
          }, (err, socket2) => {
            if (err) {
              reject(err);
            } else {
              resolve(socket2);
            }
          });
        });
        if (!llhttpInstance) {
          llhttpInstance = await llhttpPromise;
          llhttpPromise = null;
        }
        client[kConnecting] = false;
        assert(socket);
        client[kSocket] = socket;
        socket[kNoRef] = false;
        socket[kWriting] = false;
        socket[kReset] = false;
        socket[kBlocking] = false;
        socket[kError] = null;
        socket[kParser] = new Parser(client, socket, llhttpInstance);
        socket[kClient] = client;
        socket[kCounter] = 0;
        socket[kMaxRequests] = client[kMaxRequests];
        socket.on("error", onSocketError).on("readable", onSocketReadable).on("end", onSocketEnd).on("close", onSocketClose);
        if (channels.connected.hasSubscribers) {
          channels.connected.publish({
            connectParams: {
              host,
              hostname,
              protocol,
              port,
              servername: client[kServerName]
            },
            connector: client[kConnector],
            socket
          });
        }
        client.emit("connect", client[kUrl], [client]);
      } catch (err) {
        client[kConnecting] = false;
        if (channels.connectError.hasSubscribers) {
          channels.connectError.publish({
            connectParams: {
              host,
              hostname,
              protocol,
              port,
              servername: client[kServerName]
            },
            connector: client[kConnector],
            error: err
          });
        }
        if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
          assert(client[kRunning] === 0);
          while (client[kPending] > 0 && client[kQueue][client[kPendingIdx]].servername === client[kServerName]) {
            const request = client[kQueue][client[kPendingIdx]++];
            errorRequest(client, request, err);
          }
        } else {
          onError(client, err);
        }
        client.emit("connectionError", client[kUrl], [client], err);
      }
      resume(client);
    }
    __name(connect, "connect");
    function emitDrain(client) {
      client[kNeedDrain] = 0;
      client.emit("drain", client[kUrl], [client]);
    }
    __name(emitDrain, "emitDrain");
    function resume(client, sync) {
      if (client[kResuming] === 2) {
        return;
      }
      client[kResuming] = 2;
      _resume(client, sync);
      client[kResuming] = 0;
      if (client[kRunningIdx] > 256) {
        client[kQueue].splice(0, client[kRunningIdx]);
        client[kPendingIdx] -= client[kRunningIdx];
        client[kRunningIdx] = 0;
      }
    }
    __name(resume, "resume");
    function _resume(client, sync) {
      while (true) {
        if (client.destroyed) {
          assert(client[kPending] === 0);
          return;
        }
        if (client.closed && !client[kSize]) {
          client.destroy();
          return;
        }
        const socket = client[kSocket];
        if (socket) {
          if (client[kSize] === 0) {
            if (!socket[kNoRef] && socket.unref) {
              socket.unref();
              socket[kNoRef] = true;
            }
          } else if (socket[kNoRef] && socket.ref) {
            socket.ref();
            socket[kNoRef] = false;
          }
          if (client[kSize] === 0) {
            if (socket[kParser].timeoutType !== TIMEOUT_IDLE) {
              socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_IDLE);
            }
          } else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
            if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
              const request2 = client[kQueue][client[kRunningIdx]];
              const headersTimeout = request2.headersTimeout != null ? request2.headersTimeout : client[kHeadersTimeout];
              socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS);
            }
          }
        }
        if (client[kBusy]) {
          client[kNeedDrain] = 2;
        } else if (client[kNeedDrain] === 2) {
          if (sync) {
            client[kNeedDrain] = 1;
            process.nextTick(emitDrain, client);
          } else {
            emitDrain(client);
          }
          continue;
        }
        if (client[kPending] === 0) {
          return;
        }
        if (client[kRunning] >= (client[kPipelining] || 1)) {
          return;
        }
        const request = client[kQueue][client[kPendingIdx]];
        if (client[kUrl].protocol === "https:" && client[kServerName] !== request.servername) {
          if (client[kRunning] > 0) {
            return;
          }
          client[kServerName] = request.servername;
          if (socket && socket.servername !== request.servername) {
            util.destroy(socket, new InformationalError("servername changed"));
            return;
          }
        }
        if (client[kConnecting]) {
          return;
        }
        if (!socket) {
          connect(client);
          continue;
        }
        if (socket.destroyed || socket[kWriting] || socket[kReset] || socket[kBlocking]) {
          return;
        }
        if (client[kRunning] > 0 && !request.idempotent) {
          return;
        }
        if (client[kRunning] > 0 && (request.upgrade || request.method === "CONNECT")) {
          return;
        }
        if (util.isStream(request.body) && util.bodyLength(request.body) === 0) {
          request.body.on("data", function() {
            assert(false);
          }).on("error", function(err) {
            errorRequest(client, request, err);
          }).on("end", function() {
            util.destroy(this);
          });
          request.body = null;
        }
        if (client[kRunning] > 0 && (util.isStream(request.body) || util.isAsyncIterable(request.body))) {
          return;
        }
        if (!request.aborted && write(client, request)) {
          client[kPendingIdx]++;
        } else {
          client[kQueue].splice(client[kPendingIdx], 1);
        }
      }
    }
    __name(_resume, "_resume");
    function write(client, request) {
      const { body, method, path, host, upgrade, headers, blocking } = request;
      const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH";
      if (body && typeof body.read === "function") {
        body.read(0);
      }
      let contentLength = util.bodyLength(body);
      if (contentLength === null) {
        contentLength = request.contentLength;
      }
      if (contentLength === 0 && !expectsPayload) {
        contentLength = null;
      }
      if (request.contentLength !== null && request.contentLength !== contentLength) {
        if (client[kStrictContentLength]) {
          errorRequest(client, request, new RequestContentLengthMismatchError());
          return false;
        }
        process.emitWarning(new RequestContentLengthMismatchError());
      }
      const socket = client[kSocket];
      try {
        request.onConnect((err) => {
          if (request.aborted || request.completed) {
            return;
          }
          errorRequest(client, request, err || new RequestAbortedError());
          util.destroy(socket, new InformationalError("aborted"));
        });
      } catch (err) {
        errorRequest(client, request, err);
      }
      if (request.aborted) {
        return false;
      }
      if (method === "HEAD") {
        socket[kReset] = true;
      }
      if (upgrade || method === "CONNECT") {
        socket[kReset] = true;
      }
      if (client[kMaxRequests] && socket[kCounter]++ >= client[kMaxRequests]) {
        socket[kReset] = true;
      }
      if (blocking) {
        socket[kBlocking] = true;
      }
      let header = `${method} ${path} HTTP/1.1\r
`;
      if (typeof host === "string") {
        header += `host: ${host}\r
`;
      } else {
        header += client[kHostHeader];
      }
      if (upgrade) {
        header += `connection: upgrade\r
upgrade: ${upgrade}\r
`;
      } else if (client[kPipelining]) {
        header += "connection: keep-alive\r\n";
      } else {
        header += "connection: close\r\n";
      }
      if (headers) {
        header += headers;
      }
      if (channels.sendHeaders.hasSubscribers) {
        channels.sendHeaders.publish({ request, headers: header, socket });
      }
      if (!body) {
        if (contentLength === 0) {
          socket.write(`${header}content-length: 0\r
\r
`, "ascii");
        } else {
          assert(contentLength === null, "no body must not have content length");
          socket.write(`${header}\r
`, "ascii");
        }
        request.onRequestSent();
      } else if (util.isBuffer(body)) {
        assert(contentLength === body.byteLength, "buffer body must have content length");
        socket.cork();
        socket.write(`${header}content-length: ${contentLength}\r
\r
`, "ascii");
        socket.write(body);
        socket.uncork();
        request.onBodySent(body);
        request.onRequestSent();
        if (!expectsPayload) {
          socket[kReset] = true;
        }
      } else if (util.isBlobLike(body)) {
        if (typeof body.stream === "function") {
          writeIterable({ body: body.stream(), client, request, socket, contentLength, header, expectsPayload });
        } else {
          writeBlob({ body, client, request, socket, contentLength, header, expectsPayload });
        }
      } else if (util.isStream(body)) {
        writeStream({ body, client, request, socket, contentLength, header, expectsPayload });
      } else if (util.isIterable(body)) {
        writeIterable({ body, client, request, socket, contentLength, header, expectsPayload });
      } else {
        assert(false);
      }
      return true;
    }
    __name(write, "write");
    function writeStream({ body, client, request, socket, contentLength, header, expectsPayload }) {
      assert(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
      let finished = false;
      const writer = new AsyncWriter({ socket, request, contentLength, client, expectsPayload, header });
      const onData = /* @__PURE__ */ __name(function(chunk) {
        try {
          assert(!finished);
          if (!writer.write(chunk) && this.pause) {
            this.pause();
          }
        } catch (err) {
          util.destroy(this, err);
        }
      }, "onData");
      const onDrain = /* @__PURE__ */ __name(function() {
        assert(!finished);
        if (body.resume) {
          body.resume();
        }
      }, "onDrain");
      const onAbort = /* @__PURE__ */ __name(function() {
        onFinished(new RequestAbortedError());
      }, "onAbort");
      const onFinished = /* @__PURE__ */ __name(function(err) {
        if (finished) {
          return;
        }
        finished = true;
        assert(socket.destroyed || socket[kWriting] && client[kRunning] <= 1);
        socket.off("drain", onDrain).off("error", onFinished);
        body.removeListener("data", onData).removeListener("end", onFinished).removeListener("error", onFinished).removeListener("close", onAbort);
        if (!err) {
          try {
            writer.end();
          } catch (er) {
            err = er;
          }
        }
        writer.destroy(err);
        if (err && (err.code !== "UND_ERR_INFO" || err.message !== "reset")) {
          util.destroy(body, err);
        } else {
          util.destroy(body);
        }
      }, "onFinished");
      body.on("data", onData).on("end", onFinished).on("error", onFinished).on("close", onAbort);
      if (body.resume) {
        body.resume();
      }
      socket.on("drain", onDrain).on("error", onFinished);
    }
    __name(writeStream, "writeStream");
    async function writeBlob({ body, client, request, socket, contentLength, header, expectsPayload }) {
      assert(contentLength === body.size, "blob body must have content length");
      try {
        if (contentLength != null && contentLength !== body.size) {
          throw new RequestContentLengthMismatchError();
        }
        const buffer = Buffer.from(await body.arrayBuffer());
        socket.cork();
        socket.write(`${header}content-length: ${contentLength}\r
\r
`, "ascii");
        socket.write(buffer);
        socket.uncork();
        request.onBodySent(buffer);
        request.onRequestSent();
        if (!expectsPayload) {
          socket[kReset] = true;
        }
        resume(client);
      } catch (err) {
        util.destroy(socket, err);
      }
    }
    __name(writeBlob, "writeBlob");
    async function writeIterable({ body, client, request, socket, contentLength, header, expectsPayload }) {
      assert(contentLength !== 0 || client[kRunning] === 0, "iterator body cannot be pipelined");
      let callback = null;
      function onDrain() {
        if (callback) {
          const cb = callback;
          callback = null;
          cb();
        }
      }
      __name(onDrain, "onDrain");
      const waitForDrain = /* @__PURE__ */ __name(() => new Promise((resolve, reject) => {
        assert(callback === null);
        if (socket[kError]) {
          reject(socket[kError]);
        } else {
          callback = resolve;
        }
      }), "waitForDrain");
      socket.on("close", onDrain).on("drain", onDrain);
      const writer = new AsyncWriter({ socket, request, contentLength, client, expectsPayload, header });
      try {
        for await (const chunk of body) {
          if (socket[kError]) {
            throw socket[kError];
          }
          if (!writer.write(chunk)) {
            await waitForDrain();
          }
        }
        writer.end();
      } catch (err) {
        writer.destroy(err);
      } finally {
        socket.off("close", onDrain).off("drain", onDrain);
      }
    }
    __name(writeIterable, "writeIterable");
    var AsyncWriter = class {
      constructor({ socket, request, contentLength, client, expectsPayload, header }) {
        this.socket = socket;
        this.request = request;
        this.contentLength = contentLength;
        this.client = client;
        this.bytesWritten = 0;
        this.expectsPayload = expectsPayload;
        this.header = header;
        socket[kWriting] = true;
      }
      write(chunk) {
        const { socket, request, contentLength, client, bytesWritten, expectsPayload, header } = this;
        if (socket[kError]) {
          throw socket[kError];
        }
        if (socket.destroyed) {
          return false;
        }
        const len = Buffer.byteLength(chunk);
        if (!len) {
          return true;
        }
        if (contentLength !== null && bytesWritten + len > contentLength) {
          if (client[kStrictContentLength]) {
            throw new RequestContentLengthMismatchError();
          }
          process.emitWarning(new RequestContentLengthMismatchError());
        }
        if (bytesWritten === 0) {
          if (!expectsPayload) {
            socket[kReset] = true;
          }
          if (contentLength === null) {
            socket.write(`${header}transfer-encoding: chunked\r
`, "ascii");
          } else {
            socket.write(`${header}content-length: ${contentLength}\r
\r
`, "ascii");
          }
        }
        if (contentLength === null) {
          socket.write(`\r
${len.toString(16)}\r
`, "ascii");
        }
        this.bytesWritten += len;
        const ret = socket.write(chunk);
        request.onBodySent(chunk);
        return ret;
      }
      end() {
        const { socket, contentLength, client, bytesWritten, expectsPayload, header, request } = this;
        request.onRequestSent();
        socket[kWriting] = false;
        if (socket[kError]) {
          throw socket[kError];
        }
        if (socket.destroyed) {
          return;
        }
        if (bytesWritten === 0) {
          if (expectsPayload) {
            socket.write(`${header}content-length: 0\r
\r
`, "ascii");
          } else {
            socket.write(`${header}\r
`, "ascii");
          }
        } else if (contentLength === null) {
          socket.write("\r\n0\r\n\r\n", "ascii");
        }
        if (contentLength !== null && bytesWritten !== contentLength) {
          if (client[kStrictContentLength]) {
            throw new RequestContentLengthMismatchError();
          } else {
            process.emitWarning(new RequestContentLengthMismatchError());
          }
        }
        if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
          if (socket[kParser].timeout.refresh) {
            socket[kParser].timeout.refresh();
          }
        }
        resume(client);
      }
      destroy(err) {
        const { socket, client } = this;
        socket[kWriting] = false;
        if (err) {
          assert(client[kRunning] <= 1, "pipeline should only contain this request");
          util.destroy(socket, err);
        }
      }
    };
    __name(AsyncWriter, "AsyncWriter");
    function errorRequest(client, request, err) {
      try {
        request.onError(err);
        assert(request.aborted);
      } catch (err2) {
        client.emit("error", err2);
      }
    }
    __name(errorRequest, "errorRequest");
    module2.exports = Client;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/pool.js
var require_pool = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/pool.js"(exports, module2) {
    "use strict";
    var {
      PoolBase,
      kClients,
      kNeedDrain,
      kAddClient,
      kGetDispatcher
    } = require_pool_base();
    var Client = require_client();
    var {
      InvalidArgumentError: InvalidArgumentError2
    } = require_errors();
    var util = require_util();
    var { kUrl } = require_symbols();
    var buildConnector = require_connect();
    var kOptions = Symbol("options");
    var kConnections = Symbol("connections");
    var kFactory = Symbol("factory");
    function defaultFactory(origin, opts) {
      return new Client(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var Pool = class extends PoolBase {
      constructor(origin, {
        connections,
        factory = defaultFactory,
        connect,
        connectTimeout,
        tls,
        maxCachedSessions,
        socketPath,
        ...options
      } = {}) {
        super();
        if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
          throw new InvalidArgumentError2("invalid connections");
        }
        if (typeof factory !== "function") {
          throw new InvalidArgumentError2("factory must be a function.");
        }
        if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
          throw new InvalidArgumentError2("connect must be a function or an object");
        }
        if (typeof connect !== "function") {
          connect = buildConnector({
            ...tls,
            maxCachedSessions,
            socketPath,
            timeout: connectTimeout == null ? 1e4 : connectTimeout,
            ...connect
          });
        }
        this[kConnections] = connections || null;
        this[kUrl] = util.parseOrigin(origin);
        this[kOptions] = { ...util.deepClone(options), connect };
        this[kFactory] = factory;
      }
      [kGetDispatcher]() {
        let dispatcher = this[kClients].find((dispatcher2) => !dispatcher2[kNeedDrain]);
        if (dispatcher) {
          return dispatcher;
        }
        if (!this[kConnections] || this[kClients].length < this[kConnections]) {
          dispatcher = this[kFactory](this[kUrl], this[kOptions]);
          this[kAddClient](dispatcher);
        }
        return dispatcher;
      }
    };
    __name(Pool, "Pool");
    module2.exports = Pool;
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/compat/dispatcher-weakref.js
var require_dispatcher_weakref = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/compat/dispatcher-weakref.js"(exports, module2) {
    "use strict";
    var { kConnected, kSize } = require_symbols();
    var CompatWeakRef = class {
      constructor(value) {
        this.value = value;
      }
      deref() {
        return this.value[kConnected] === 0 && this.value[kSize] === 0 ? void 0 : this.value;
      }
    };
    __name(CompatWeakRef, "CompatWeakRef");
    var CompatFinalizer = class {
      constructor(finalizer) {
        this.finalizer = finalizer;
      }
      register(dispatcher, key) {
        dispatcher.on("disconnect", () => {
          if (dispatcher[kConnected] === 0 && dispatcher[kSize] === 0) {
            this.finalizer(key);
          }
        });
      }
    };
    __name(CompatFinalizer, "CompatFinalizer");
    module2.exports = function() {
      return {
        WeakRef: global.WeakRef || CompatWeakRef,
        FinalizationRegistry: global.FinalizationRegistry || CompatFinalizer
      };
    };
  }
});

// ../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/agent.js
var require_agent = __commonJS({
  "../../node_modules/.pnpm/undici@5.5.1/node_modules/undici/lib/agent.js"(exports, module2) {
    "use strict";
    var { InvalidArgumentError: InvalidArgumentError2 } = require_errors();
    var { kClients, kRunning, kClose, kDestroy, kDispatch } = require_symbols();
    var DispatcherBase = require_dispatcher_base();
    var Pool = require_pool();
    var Client = require_client();
    var util = require_util();
    var RedirectHandler = require_redirect();
    var { WeakRef, FinalizationRegistry: FinalizationRegistry2 } = require_dispatcher_weakref()();
    var kOnConnect = Symbol("onConnect");
    var kOnDisconnect = Symbol("onDisconnect");
    var kOnConnectionError = Symbol("onConnectionError");
    var kMaxRedirections = Symbol("maxRedirections");
    var kOnDrain = Symbol("onDrain");
    var kFactory = Symbol("factory");
    var kFinalizer = Symbol("finalizer");
    var kOptions = Symbol("options");
    function defaultFactory(origin, opts) {
      return opts && opts.connections === 1 ? new Client(origin, opts) : new Pool(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var Agent = class extends DispatcherBase {
      constructor({ factory = defaultFactory, maxRedirections = 0, connect, ...options } = {}) {
        super();
        if (typeof factory !== "function") {
          throw new InvalidArgumentError2("factory must be a function.");
        }
        if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
          throw new InvalidArgumentError2("connect must be a function or an object");
        }
        if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
          throw new InvalidArgumentError2("maxRedirections must be a positive number");
        }
        if (connect && typeof connect !== "function") {
          connect = { ...connect };
        }
        this[kOptions] = { ...util.deepClone(options), connect };
        this[kMaxRedirections] = maxRedirections;
        this[kFactory] = factory;
        this[kClients] = /* @__PURE__ */ new Map();
        this[kFinalizer] = new FinalizationRegistry2((key) => {
          const ref = this[kClients].get(key);
          if (ref !== void 0 && ref.deref() === void 0) {
            this[kClients].delete(key);
          }
        });
        const agent = this;
        this[kOnDrain] = (origin, targets) => {
          agent.emit("drain", origin, [agent, ...targets]);
        };
        this[kOnConnect] = (origin, targets) => {
          agent.emit("connect", origin, [agent, ...targets]);
        };
        this[kOnDisconnect] = (origin, targets, err) => {
          agent.emit("disconnect", origin, [agent, ...targets], err);
        };
        this[kOnConnectionError] = (origin, targets, err) => {
          agent.emit("connectionError", origin, [agent, ...targets], err);
        };
      }
      get [kRunning]() {
        let ret = 0;
        for (const ref of this[kClients].values()) {
          const client = ref.deref();
          if (client) {
            ret += client[kRunning];
          }
        }
        return ret;
      }
      [kDispatch](opts, handler) {
        let key;
        if (opts.origin && (typeof opts.origin === "string" || opts.origin instanceof URL)) {
          key = String(opts.origin);
        } else {
          throw new InvalidArgumentError2("opts.origin must be a non-empty string or URL.");
        }
        const ref = this[kClients].get(key);
        let dispatcher = ref ? ref.deref() : null;
        if (!dispatcher) {
          dispatcher = this[kFactory](opts.origin, this[kOptions]).on("drain", this[kOnDrain]).on("connect", this[kOnConnect]).on("disconnect", this[kOnDisconnect]).on("connectionError", this[kOnConnectionError]);
          this[kClients].set(key, new WeakRef(dispatcher));
          this[kFinalizer].register(dispatcher, key);
        }
        const { maxRedirections = this[kMaxRedirections] } = opts;
        if (maxRedirections != null && maxRedirections !== 0) {
          opts = { ...opts, maxRedirections: 0 };
          handler = new RedirectHandler(this, maxRedirections, opts, handler);
        }
        return dispatcher.dispatch(opts, handler);
      }
      async [kClose]() {
        const closePromises = [];
        for (const ref of this[kClients].values()) {
          const client = ref.deref();
          if (client) {
            closePromises.push(client.close());
          }
        }
        await Promise.all(closePromises);
      }
      async [kDestroy](err) {
        const destroyPromises = [];
        for (const ref of this[kClients].values()) {
          const client = ref.deref();
          if (client) {
            destroyPromises.push(client.destroy(err));
          }
        }
        await Promise.all(destroyPromises);
      }
    };
    __name(Agent, "Agent");
    module2.exports = Agent;
  }
});

// src/polyfills/undici.js
var require_undici = __commonJS({
  "src/polyfills/undici.js"(exports, module2) {
    "use strict";
    var abort = require_abort_controller();
    global.AbortController = abort.AbortController;
    global.AbortSignal = abort.AbortSignal;
    global.FinalizationRegistry = function() {
      return {
        register: function() {
        }
      };
    };
    var Constants = require_constants2();
    var CoreSymbols = require_symbols();
    Constants.forbiddenResponseHeaderNames = [];
    Constants.forbiddenHeaderNames = [];
    var fetchImpl = require_fetch();
    var Agent = require_agent();
    var globalDispatcher = new Agent();
    function getGlobalDispatcher() {
      return globalDispatcher;
    }
    __name(getGlobalDispatcher, "getGlobalDispatcher");
    function setGlobalDispatcher(agent) {
      if (!agent || typeof agent.dispatch !== "function") {
        throw new InvalidArgumentError("Argument agent must implement Agent");
      }
      globalDispatcher = agent;
    }
    __name(setGlobalDispatcher, "setGlobalDispatcher");
    var HeadersModule = require_headers();
    var SCookies = Symbol("set-cookie");
    var __append = HeadersModule.HeadersList.prototype.append;
    HeadersModule.HeadersList.prototype.append = function(name, value) {
      const result = __append.call(this, name, value);
      if (!this[SCookies]) {
        Object.defineProperty(this, SCookies, {
          configurable: false,
          enumerable: false,
          writable: true,
          value: []
        });
      }
      const _name = HeadersModule.normalizeAndValidateHeaderName(name);
      if (_name === "set-cookie") {
        this[SCookies].push(HeadersModule.normalizeAndValidateHeaderValue(_name, value));
      }
      return result;
    };
    var __set = HeadersModule.HeadersList.prototype.set;
    HeadersModule.HeadersList.prototype.set = function(name, value) {
      const result = __set.call(this, name, value);
      if (!this[SCookies]) {
        Object.defineProperty(this, SCookies, {
          configurable: false,
          enumerable: false,
          writable: true,
          value: []
        });
      }
      const _name = HeadersModule.normalizeAndValidateHeaderName(name);
      if (_name === "set-cookie") {
        this[SCookies] = [
          HeadersModule.normalizeAndValidateHeaderValue(_name, value)
        ];
      }
      return result;
    };
    var __delete = HeadersModule.HeadersList.prototype.delete;
    HeadersModule.HeadersList.prototype.delete = function(name) {
      __delete.call(this, name);
      if (!this[SCookies]) {
        Object.defineProperty(this, SCookies, {
          configurable: false,
          enumerable: false,
          writable: true,
          value: []
        });
      }
      const _name = HeadersModule.normalizeAndValidateHeaderName(name);
      if (_name === "set-cookie") {
        this[SCookies] = [];
      }
    };
    HeadersModule.Headers.prototype.getAll = function(name) {
      const _name = HeadersModule.normalizeAndValidateHeaderName(name);
      if (_name !== "set-cookie") {
        throw new Error(`getAll can only be used with 'set-cookie'`);
      }
      return this[CoreSymbols.kHeadersList][SCookies] || [];
    };
    module2.exports.Headers = HeadersModule.Headers;
    var ResponseModule = require_response();
    var FetchSymbols = require_symbols2();
    var __error = ResponseModule.Response.error;
    ResponseModule.Response.error = function(...args) {
      const response = __error.call(this, ...args);
      response[FetchSymbols.kHeaders][FetchSymbols.kGuard] = "response";
      return response;
    };
    module2.exports.Response = ResponseModule.Response;
    module2.exports.fetch = /* @__PURE__ */ __name(async function fetch() {
      const res = await fetchImpl.apply(getGlobalDispatcher(), arguments);
      const response = new ResponseModule.Response(res.body, res);
      Object.defineProperty(response, "url", { value: res.url });
      return response;
    }, "fetch");
    module2.exports.Request = require_request().Request;
    module2.exports.FormData = require_formdata().FormData;
    module2.exports.File = require_file().File;
    module2.exports.getGlobalDispatcher = getGlobalDispatcher;
    module2.exports.setGlobalDispatcher = setGlobalDispatcher;
  }
});

// src/polyfills/cache.js
var require_cache = __commonJS({
  "src/polyfills/cache.js"(exports, module2) {
    "use strict";
    module2.exports = ({ fetch, Request, Response }) => {
      const getKey = /* @__PURE__ */ __name((request) => new URL(request.url).toString(), "getKey");
      const normalizeRequest = /* @__PURE__ */ __name((input, { invokeName }) => {
        if (typeof proxy === "object" && proxy.__normalized__)
          return input;
        const request = input instanceof Request ? input : new Request(input);
        if (request.method !== "GET") {
          throw new TypeError(`Failed to execute '${invokeName}' on 'Cache': Request method '${request.method}' is unsupported`);
        }
        if (!request.url.startsWith("http")) {
          throw new TypeError(`Failed to execute '${invokeName}' on 'Cache': Request scheme '${request.url.split(":")[0]}' is unsupported`);
        }
        Object.defineProperty(request, "__normalized__", {
          enumerable: false,
          writable: false,
          value: true
        });
        return request;
      }, "normalizeRequest");
      class Cache2 {
        constructor(Storage = Map) {
          Object.defineProperty(this, "store", {
            enumerable: false,
            writable: false,
            value: new Storage()
          });
        }
        async add(request) {
          const response = await fetch(normalizeRequest(request, { invokeName: "add" }));
          if (!response.ok) {
            throw new TypeError("Failed to execute 'add' on 'Cache': Request failed");
          }
          return this.put(request, response);
        }
        async addAll(requests) {
          await Promise.all(requests.map((request) => this.add(request)));
        }
        async match(request) {
          const key = getKey(normalizeRequest(request, { invokeName: "match" }));
          const cached = this.store.get(key);
          return cached ? new Response(cached.body, cached.init) : void 0;
        }
        async delete(request) {
          const key = getKey(normalizeRequest(request, { invokeName: "delete" }));
          return this.store.delete(key);
        }
        async put(request, response) {
          if (response.status === 206) {
            throw new TypeError("Failed to execute 'put' on 'Cache': Partial response (status code 206) is unsupported");
          }
          const vary = response.headers.get("vary");
          if (vary !== null && vary.includes("*")) {
            throw new TypeError("Failed to execute 'put' on 'Cache': Vary header contains *");
          }
          request = normalizeRequest(request, { invokeName: "put" });
          try {
            this.store.set(getKey(request), {
              body: new Uint8Array(await response.arrayBuffer()),
              init: {
                status: response.status,
                headers: [...response.headers]
              }
            });
          } catch (error) {
            if (error.message === "disturbed") {
              throw new TypeError("Failed to execute 'put' on 'Cache': Response body is already used");
            }
            throw error;
          }
        }
      }
      __name(Cache2, "Cache");
      const cacheStorage = /* @__PURE__ */ __name((Storage = Map) => {
        const caches = new Storage();
        const open = /* @__PURE__ */ __name(async (cacheName) => {
          let cache = caches.get(cacheName);
          if (cache === void 0) {
            cache = new Cache2(Storage);
            caches.set(cacheName, cache);
          }
          return cache;
        }, "open");
        const has = /* @__PURE__ */ __name((cacheName) => Promise.resolve(caches.has(cacheName)), "has");
        const keys = /* @__PURE__ */ __name(() => Promise.resolve(caches.keys()), "keys");
        const _delete = /* @__PURE__ */ __name((cacheName) => Promise.resolve(caches.delete(cacheName)), "_delete");
        const match = /* @__PURE__ */ __name(async (request, options) => {
          for (const cache of caches.values()) {
            const cached = await cache.match(request, options);
            if (cached !== void 0)
              return cached;
          }
        }, "match");
        return {
          open,
          has,
          keys,
          delete: _delete,
          match
        };
      }, "cacheStorage");
      return { fetch, Request, Response, Cache: Cache2, cacheStorage };
    };
    function CacheStorage() {
      if (!(this instanceof CacheStorage))
        return new CacheStorage();
      throw TypeError("Illegal constructor");
    }
    __name(CacheStorage, "CacheStorage");
    function CacheStorageToString() {
      return "function CacheStorage() { [native code] }";
    }
    __name(CacheStorageToString, "CacheStorageToString");
    Object.defineProperty(CacheStorageToString, "name", {
      configurable: true,
      enumerable: false,
      value: "toString() { [native code] }",
      writable: true
    });
    Object.defineProperty(CacheStorage, "toString", {
      configurable: true,
      enumerable: false,
      value: CacheStorageToString,
      writable: true
    });
    function Cache() {
      if (!(this instanceof Cache))
        return new Cache();
      throw TypeError("Illegal constructor");
    }
    __name(Cache, "Cache");
    function CacheToString() {
      return "function Cache() { [native code] }";
    }
    __name(CacheToString, "CacheToString");
    Object.defineProperty(CacheToString, "name", {
      configurable: true,
      enumerable: false,
      value: "toString() { [native code] }",
      writable: true
    });
    Object.defineProperty(Cache, "toString", {
      configurable: true,
      enumerable: false,
      value: CacheToString,
      writable: true
    });
    module2.exports.CacheStorage = CacheStorage;
    module2.exports.Cache = Cache;
  }
});

// src/polyfills/web-event.js
var require_web_event = __commonJS({
  "src/polyfills/web-event.js"(exports, module2) {
    "use strict";
    var EventTargetShim = require_event_target_shim();
    var { EventTarget } = EventTargetShim;
    var Event = class extends EventTargetShim {
    };
    __name(Event, "Event");
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
    module2.exports = {
      Event,
      EventTarget,
      FetchEvent,
      PromiseRejectionEvent
    };
  }
});

// ../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/types.js
var require_types = __commonJS({
  "../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/types.js"(exports) {
    "use strict";
    var VOID = -1;
    exports.VOID = VOID;
    var PRIMITIVE = 0;
    exports.PRIMITIVE = PRIMITIVE;
    var ARRAY = 1;
    exports.ARRAY = ARRAY;
    var OBJECT = 2;
    exports.OBJECT = OBJECT;
    var DATE2 = 3;
    exports.DATE = DATE2;
    var REGEXP = 4;
    exports.REGEXP = REGEXP;
    var MAP = 5;
    exports.MAP = MAP;
    var SET = 6;
    exports.SET = SET;
    var ERROR = 7;
    exports.ERROR = ERROR;
    var BIGINT = 8;
    exports.BIGINT = BIGINT;
  }
});

// ../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/deserialize.js
var require_deserialize = __commonJS({
  "../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/deserialize.js"(exports) {
    "use strict";
    var {
      VOID,
      PRIMITIVE,
      ARRAY,
      OBJECT,
      DATE: DATE2,
      REGEXP,
      MAP,
      SET,
      ERROR,
      BIGINT
    } = require_types();
    var env = typeof self === "object" ? self : globalThis;
    var deserializer = /* @__PURE__ */ __name(($, _) => {
      const as = /* @__PURE__ */ __name((out, index) => {
        $.set(index, out);
        return out;
      }, "as");
      const unpair = /* @__PURE__ */ __name((index) => {
        if ($.has(index))
          return $.get(index);
        const [type, value] = _[index];
        switch (type) {
          case PRIMITIVE:
          case VOID:
            return as(value, index);
          case ARRAY: {
            const arr = as([], index);
            for (const index2 of value)
              arr.push(unpair(index2));
            return arr;
          }
          case OBJECT: {
            const object = as({}, index);
            for (const [key, index2] of value)
              object[unpair(key)] = unpair(index2);
            return object;
          }
          case DATE2:
            return as(new Date(value), index);
          case REGEXP: {
            const { source, flags } = value;
            return as(new RegExp(source, flags), index);
          }
          case MAP: {
            const map = as(/* @__PURE__ */ new Map(), index);
            for (const [key, index2] of value)
              map.set(unpair(key), unpair(index2));
            return map;
          }
          case SET: {
            const set = as(/* @__PURE__ */ new Set(), index);
            for (const index2 of value)
              set.add(unpair(index2));
            return set;
          }
          case ERROR: {
            const { name, message } = value;
            return as(new env[name](message), index);
          }
          case BIGINT:
            return as(BigInt(value), index);
          case "BigInt":
            return as(Object(BigInt(value)), index);
        }
        return as(new env[type](value), index);
      }, "unpair");
      return unpair;
    }, "deserializer");
    var deserialize = /* @__PURE__ */ __name((serialized) => deserializer(/* @__PURE__ */ new Map(), serialized)(0), "deserialize");
    exports.deserialize = deserialize;
  }
});

// ../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/serialize.js
var require_serialize = __commonJS({
  "../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/serialize.js"(exports) {
    "use strict";
    var {
      VOID,
      PRIMITIVE,
      ARRAY,
      OBJECT,
      DATE: DATE2,
      REGEXP,
      MAP,
      SET,
      ERROR,
      BIGINT
    } = require_types();
    var EMPTY = "";
    var { toString } = {};
    var { keys } = Object;
    var typeOf = /* @__PURE__ */ __name((value) => {
      const type = typeof value;
      if (type !== "object" || !value)
        return [PRIMITIVE, type];
      const asString = toString.call(value).slice(8, -1);
      switch (asString) {
        case "Array":
          return [ARRAY, EMPTY];
        case "Object":
          return [OBJECT, EMPTY];
        case "Date":
          return [DATE2, EMPTY];
        case "RegExp":
          return [REGEXP, EMPTY];
        case "Map":
          return [MAP, EMPTY];
        case "Set":
          return [SET, EMPTY];
      }
      if (asString.includes("Array"))
        return [ARRAY, asString];
      if (asString.includes("Error"))
        return [ERROR, asString];
      return [OBJECT, asString];
    }, "typeOf");
    var shouldSkip = /* @__PURE__ */ __name(([TYPE, type]) => TYPE === PRIMITIVE && (type === "function" || type === "symbol"), "shouldSkip");
    var serializer = /* @__PURE__ */ __name((strict, json, $, _) => {
      const as = /* @__PURE__ */ __name((out, value) => {
        const index = _.push(out) - 1;
        $.set(value, index);
        return index;
      }, "as");
      const pair = /* @__PURE__ */ __name((value) => {
        if ($.has(value))
          return $.get(value);
        let [TYPE, type] = typeOf(value);
        switch (TYPE) {
          case PRIMITIVE: {
            let entry = value;
            switch (type) {
              case "bigint":
                TYPE = BIGINT;
                entry = value.toString();
                break;
              case "function":
              case "symbol":
                if (strict)
                  throw new TypeError("unable to serialize " + type);
                entry = null;
                break;
              case "undefined":
                return as([VOID], value);
            }
            return as([TYPE, entry], value);
          }
          case ARRAY: {
            if (type)
              return as([type, [...value]], value);
            const arr = [];
            const index = as([TYPE, arr], value);
            for (const entry of value)
              arr.push(pair(entry));
            return index;
          }
          case OBJECT: {
            if (type) {
              switch (type) {
                case "BigInt":
                  return as([type, value.toString()], value);
                case "Boolean":
                case "Number":
                case "String":
                  return as([type, value.valueOf()], value);
              }
            }
            if (json && "toJSON" in value)
              return pair(value.toJSON());
            const entries = [];
            const index = as([TYPE, entries], value);
            for (const key of keys(value)) {
              if (strict || !shouldSkip(typeOf(value[key])))
                entries.push([pair(key), pair(value[key])]);
            }
            return index;
          }
          case DATE2:
            return as([TYPE, value.toISOString()], value);
          case REGEXP: {
            const { source, flags } = value;
            return as([TYPE, { source, flags }], value);
          }
          case MAP: {
            const entries = [];
            const index = as([TYPE, entries], value);
            for (const [key, entry] of value) {
              if (strict || !(shouldSkip(typeOf(key)) || shouldSkip(typeOf(entry))))
                entries.push([pair(key), pair(entry)]);
            }
            return index;
          }
          case SET: {
            const entries = [];
            const index = as([TYPE, entries], value);
            for (const entry of value) {
              if (strict || !shouldSkip(typeOf(entry)))
                entries.push(pair(entry));
            }
            return index;
          }
        }
        const { message } = value;
        return as([TYPE, { name: type, message }], value);
      }, "pair");
      return pair;
    }, "serializer");
    var serialize = /* @__PURE__ */ __name((value, { json, lossy } = {}) => {
      const _ = [];
      return serializer(!(json || lossy), !!json, /* @__PURE__ */ new Map(), _)(value), _;
    }, "serialize");
    exports.serialize = serialize;
  }
});

// ../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/index.js
var require_cjs3 = __commonJS({
  "../../node_modules/.pnpm/@ungap+structured-clone@1.0.1/node_modules/@ungap/structured-clone/cjs/index.js"(exports) {
    "use strict";
    var { deserialize } = require_deserialize();
    var { serialize } = require_serialize();
    Object.defineProperty(exports, "__esModule", { value: true }).default = typeof structuredClone === "function" ? (any, options) => options && ("json" in options || "lossy" in options) ? deserialize(serialize(any, options)) : structuredClone(any) : (any, options) => deserialize(serialize(any, options));
    exports.deserialize = deserialize;
    exports.serialize = serialize;
  }
});

// ../../node_modules/.pnpm/urlpattern-polyfill@5.0.3/node_modules/urlpattern-polyfill/dist/urlpattern.cjs
var require_urlpattern = __commonJS({
  "../../node_modules/.pnpm/urlpattern-polyfill@5.0.3/node_modules/urlpattern-polyfill/dist/urlpattern.cjs"(exports, module2) {
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export2 = /* @__PURE__ */ __name((target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    }, "__export");
    var __copyProps2 = /* @__PURE__ */ __name((to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key) && key !== except)
            __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
      }
      return to;
    }, "__copyProps");
    var __toCommonJS2 = /* @__PURE__ */ __name((mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod), "__toCommonJS");
    var url_pattern_exports = {};
    __export2(url_pattern_exports, {
      URLPattern: () => URLPattern
    });
    module2.exports = __toCommonJS2(url_pattern_exports);
    var regexIdentifierStart = /[$_\p{ID_Start}]/u;
    var regexIdentifierPart = /[$_\u200C\u200D\p{ID_Continue}]/u;
    function isASCII(str, extended) {
      return (extended ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(str);
    }
    __name(isASCII, "isASCII");
    function lexer(str, lenient = false) {
      const tokens = [];
      let i = 0;
      while (i < str.length) {
        const char = str[i];
        const ErrorOrInvalid = /* @__PURE__ */ __name(function(msg) {
          if (!lenient)
            throw new TypeError(msg);
          tokens.push({ type: "INVALID_CHAR", index: i, value: str[i++] });
        }, "ErrorOrInvalid");
        if (char === "*") {
          tokens.push({ type: "ASTERISK", index: i, value: str[i++] });
          continue;
        }
        if (char === "+" || char === "?") {
          tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
          continue;
        }
        if (char === "\\") {
          tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
          continue;
        }
        if (char === "{") {
          tokens.push({ type: "OPEN", index: i, value: str[i++] });
          continue;
        }
        if (char === "}") {
          tokens.push({ type: "CLOSE", index: i, value: str[i++] });
          continue;
        }
        if (char === ":") {
          let name = "";
          let j = i + 1;
          while (j < str.length) {
            const code = str.substr(j, 1);
            if (j === i + 1 && regexIdentifierStart.test(code) || j !== i + 1 && regexIdentifierPart.test(code)) {
              name += str[j++];
              continue;
            }
            break;
          }
          if (!name) {
            ErrorOrInvalid(`Missing parameter name at ${i}`);
            continue;
          }
          tokens.push({ type: "NAME", index: i, value: name });
          i = j;
          continue;
        }
        if (char === "(") {
          let count = 1;
          let pattern = "";
          let j = i + 1;
          let error = false;
          if (str[j] === "?") {
            ErrorOrInvalid(`Pattern cannot start with "?" at ${j}`);
            continue;
          }
          while (j < str.length) {
            if (!isASCII(str[j], false)) {
              ErrorOrInvalid(`Invalid character '${str[j]}' at ${j}.`);
              error = true;
              break;
            }
            if (str[j] === "\\") {
              pattern += str[j++] + str[j++];
              continue;
            }
            if (str[j] === ")") {
              count--;
              if (count === 0) {
                j++;
                break;
              }
            } else if (str[j] === "(") {
              count++;
              if (str[j + 1] !== "?") {
                ErrorOrInvalid(`Capturing groups are not allowed at ${j}`);
                error = true;
                break;
              }
            }
            pattern += str[j++];
          }
          if (error) {
            continue;
          }
          if (count) {
            ErrorOrInvalid(`Unbalanced pattern at ${i}`);
            continue;
          }
          if (!pattern) {
            ErrorOrInvalid(`Missing pattern at ${i}`);
            continue;
          }
          tokens.push({ type: "PATTERN", index: i, value: pattern });
          i = j;
          continue;
        }
        tokens.push({ type: "CHAR", index: i, value: str[i++] });
      }
      tokens.push({ type: "END", index: i, value: "" });
      return tokens;
    }
    __name(lexer, "lexer");
    function parse(str, options = {}) {
      var _a2;
      const tokens = lexer(str);
      const { prefixes = "./" } = options;
      const defaultPattern = `[^${escapeString((_a2 = options.delimiter) != null ? _a2 : "/#?")}]+?`;
      const result = [];
      let key = 0;
      let i = 0;
      let path = "";
      let nameSet = /* @__PURE__ */ new Set();
      const tryConsume = /* @__PURE__ */ __name((type) => {
        if (i < tokens.length && tokens[i].type === type)
          return tokens[i++].value;
      }, "tryConsume");
      const tryConsumeModifier = /* @__PURE__ */ __name(() => {
        const r = tryConsume("MODIFIER");
        if (r) {
          return r;
        }
        return tryConsume("ASTERISK");
      }, "tryConsumeModifier");
      const mustConsume = /* @__PURE__ */ __name((type) => {
        const value = tryConsume(type);
        if (value !== void 0)
          return value;
        const { type: nextType, index } = tokens[i];
        throw new TypeError(`Unexpected ${nextType} at ${index}, expected ${type}`);
      }, "mustConsume");
      const consumeText = /* @__PURE__ */ __name(() => {
        let result2 = "";
        let value;
        while (value = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
          result2 += value;
        }
        return result2;
      }, "consumeText");
      const DefaultEncodePart = /* @__PURE__ */ __name((value) => {
        return value;
      }, "DefaultEncodePart");
      const encodePart = options.encodePart || DefaultEncodePart;
      while (i < tokens.length) {
        const char = tryConsume("CHAR");
        const name = tryConsume("NAME");
        let pattern = tryConsume("PATTERN");
        if (!name && !pattern && tryConsume("ASTERISK")) {
          pattern = ".*";
        }
        if (name || pattern) {
          let prefix = char || "";
          if (prefixes.indexOf(prefix) === -1) {
            path += prefix;
            prefix = "";
          }
          if (path) {
            result.push(encodePart(path));
            path = "";
          }
          const finalName = name || key++;
          if (nameSet.has(finalName)) {
            throw new TypeError(`Duplicate name '${finalName}'.`);
          }
          nameSet.add(finalName);
          result.push({
            name: finalName,
            prefix: encodePart(prefix),
            suffix: "",
            pattern: pattern || defaultPattern,
            modifier: tryConsumeModifier() || ""
          });
          continue;
        }
        const value = char || tryConsume("ESCAPED_CHAR");
        if (value) {
          path += value;
          continue;
        }
        const open = tryConsume("OPEN");
        if (open) {
          const prefix = consumeText();
          const name2 = tryConsume("NAME") || "";
          let pattern2 = tryConsume("PATTERN") || "";
          if (!name2 && !pattern2 && tryConsume("ASTERISK")) {
            pattern2 = ".*";
          }
          const suffix = consumeText();
          mustConsume("CLOSE");
          const modifier = tryConsumeModifier() || "";
          if (!name2 && !pattern2 && !modifier) {
            path += prefix;
            continue;
          }
          if (!name2 && !pattern2 && !prefix) {
            continue;
          }
          if (path) {
            result.push(encodePart(path));
            path = "";
          }
          result.push({
            name: name2 || (pattern2 ? key++ : ""),
            pattern: name2 && !pattern2 ? defaultPattern : pattern2,
            prefix: encodePart(prefix),
            suffix: encodePart(suffix),
            modifier
          });
          continue;
        }
        if (path) {
          result.push(encodePart(path));
          path = "";
        }
        mustConsume("END");
      }
      return result;
    }
    __name(parse, "parse");
    function escapeString(str) {
      return str.replace(/([.+*?^${}()[\]|/\\])/g, "\\$1");
    }
    __name(escapeString, "escapeString");
    function flags(options) {
      return options && options.sensitive ? "u" : "ui";
    }
    __name(flags, "flags");
    function regexpToRegexp(path, keys) {
      if (!keys)
        return path;
      const groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
      let index = 0;
      let execResult = groupsRegex.exec(path.source);
      while (execResult) {
        keys.push({
          name: execResult[1] || index++,
          prefix: "",
          suffix: "",
          modifier: "",
          pattern: ""
        });
        execResult = groupsRegex.exec(path.source);
      }
      return path;
    }
    __name(regexpToRegexp, "regexpToRegexp");
    function arrayToRegexp(paths, keys, options) {
      const parts = paths.map((path) => pathToRegexp(path, keys, options).source);
      return new RegExp(`(?:${parts.join("|")})`, flags(options));
    }
    __name(arrayToRegexp, "arrayToRegexp");
    function stringToRegexp(path, keys, options) {
      return tokensToRegexp(parse(path, options), keys, options);
    }
    __name(stringToRegexp, "stringToRegexp");
    function tokensToRegexp(tokens, keys, options = {}) {
      var _a2, _b;
      const {
        strict = false,
        start = true,
        end = true,
        encode = /* @__PURE__ */ __name((x) => x, "encode")
      } = options;
      const endsWith = `[${escapeString((_a2 = options.endsWith) != null ? _a2 : "")}]|$`;
      const delimiter = `[${escapeString((_b = options.delimiter) != null ? _b : "/#?")}]`;
      let route = start ? "^" : "";
      for (const token of tokens) {
        if (typeof token === "string") {
          route += escapeString(encode(token));
        } else {
          const prefix = escapeString(encode(token.prefix));
          const suffix = escapeString(encode(token.suffix));
          if (token.pattern) {
            if (keys)
              keys.push(token);
            if (prefix || suffix) {
              if (token.modifier === "+" || token.modifier === "*") {
                const mod = token.modifier === "*" ? "?" : "";
                route += `(?:${prefix}((?:${token.pattern})(?:${suffix}${prefix}(?:${token.pattern}))*)${suffix})${mod}`;
              } else {
                route += `(?:${prefix}(${token.pattern})${suffix})${token.modifier}`;
              }
            } else {
              if (token.modifier === "+" || token.modifier === "*") {
                route += `((?:${token.pattern})${token.modifier})`;
              } else {
                route += `(${token.pattern})${token.modifier}`;
              }
            }
          } else {
            route += `(?:${prefix}${suffix})${token.modifier}`;
          }
        }
      }
      if (end) {
        if (!strict)
          route += `${delimiter}?`;
        route += !options.endsWith ? "$" : `(?=${endsWith})`;
      } else {
        const endToken = tokens[tokens.length - 1];
        const isEndDelimited = typeof endToken === "string" ? delimiter.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
        if (!strict) {
          route += `(?:${delimiter}(?=${endsWith}))?`;
        }
        if (!isEndDelimited) {
          route += `(?=${delimiter}|${endsWith})`;
        }
      }
      return new RegExp(route, flags(options));
    }
    __name(tokensToRegexp, "tokensToRegexp");
    function pathToRegexp(path, keys, options) {
      if (path instanceof RegExp)
        return regexpToRegexp(path, keys);
      if (Array.isArray(path))
        return arrayToRegexp(path, keys, options);
      return stringToRegexp(path, keys, options);
    }
    __name(pathToRegexp, "pathToRegexp");
    var DEFAULT_OPTIONS = {
      delimiter: "",
      prefixes: "",
      sensitive: true,
      strict: true
    };
    var HOSTNAME_OPTIONS = {
      delimiter: ".",
      prefixes: "",
      sensitive: true,
      strict: true
    };
    var PATHNAME_OPTIONS = {
      delimiter: "/",
      prefixes: "/",
      sensitive: true,
      strict: true
    };
    function isAbsolutePathname(pathname, isPattern) {
      if (!pathname.length) {
        return false;
      }
      if (pathname[0] === "/") {
        return true;
      }
      if (!isPattern) {
        return false;
      }
      if (pathname.length < 2) {
        return false;
      }
      if ((pathname[0] == "\\" || pathname[0] == "{") && pathname[1] == "/") {
        return true;
      }
      return false;
    }
    __name(isAbsolutePathname, "isAbsolutePathname");
    function maybeStripPrefix(value, prefix) {
      if (value.startsWith(prefix)) {
        return value.substring(prefix.length, value.length);
      }
      return value;
    }
    __name(maybeStripPrefix, "maybeStripPrefix");
    function maybeStripSuffix(value, suffix) {
      if (value.endsWith(suffix)) {
        return value.substr(0, value.length - suffix.length);
      }
      return value;
    }
    __name(maybeStripSuffix, "maybeStripSuffix");
    function treatAsIPv6Hostname(value) {
      if (!value || value.length < 2) {
        return false;
      }
      if (value[0] === "[") {
        return true;
      }
      if ((value[0] === "\\" || value[0] === "{") && value[1] === "[") {
        return true;
      }
      return false;
    }
    __name(treatAsIPv6Hostname, "treatAsIPv6Hostname");
    var SPECIAL_SCHEMES = [
      "ftp",
      "file",
      "http",
      "https",
      "ws",
      "wss"
    ];
    function isSpecialScheme(protocol_regexp) {
      if (!protocol_regexp) {
        return true;
      }
      for (const scheme of SPECIAL_SCHEMES) {
        if (protocol_regexp.test(scheme)) {
          return true;
        }
      }
      return false;
    }
    __name(isSpecialScheme, "isSpecialScheme");
    function canonicalizeHash(hash, isPattern) {
      hash = maybeStripPrefix(hash, "#");
      if (isPattern || hash === "") {
        return hash;
      }
      const url = new URL("https://example.com");
      url.hash = hash;
      return url.hash ? url.hash.substring(1, url.hash.length) : "";
    }
    __name(canonicalizeHash, "canonicalizeHash");
    function canonicalizeSearch(search, isPattern) {
      search = maybeStripPrefix(search, "?");
      if (isPattern || search === "") {
        return search;
      }
      const url = new URL("https://example.com");
      url.search = search;
      return url.search ? url.search.substring(1, url.search.length) : "";
    }
    __name(canonicalizeSearch, "canonicalizeSearch");
    function canonicalizeHostname(hostname, isPattern) {
      if (isPattern || hostname === "") {
        return hostname;
      }
      if (treatAsIPv6Hostname(hostname)) {
        return ipv6HostnameEncodeCallback(hostname);
      } else {
        return hostnameEncodeCallback(hostname);
      }
    }
    __name(canonicalizeHostname, "canonicalizeHostname");
    function canonicalizePassword(password, isPattern) {
      if (isPattern || password === "") {
        return password;
      }
      const url = new URL("https://example.com");
      url.password = password;
      return url.password;
    }
    __name(canonicalizePassword, "canonicalizePassword");
    function canonicalizeUsername(username, isPattern) {
      if (isPattern || username === "") {
        return username;
      }
      const url = new URL("https://example.com");
      url.username = username;
      return url.username;
    }
    __name(canonicalizeUsername, "canonicalizeUsername");
    function canonicalizePathname(pathname, protocol, isPattern) {
      if (isPattern || pathname === "") {
        return pathname;
      }
      if (protocol && !SPECIAL_SCHEMES.includes(protocol)) {
        const url = new URL(`${protocol}:${pathname}`);
        return url.pathname;
      }
      const leadingSlash = pathname[0] == "/";
      pathname = new URL(!leadingSlash ? "/-" + pathname : pathname, "https://example.com").pathname;
      if (!leadingSlash) {
        pathname = pathname.substring(2, pathname.length);
      }
      return pathname;
    }
    __name(canonicalizePathname, "canonicalizePathname");
    function canonicalizePort(port, protocol, isPattern) {
      if (defaultPortForProtocol(protocol) === port) {
        port = "";
      }
      if (isPattern || port === "") {
        return port;
      }
      return portEncodeCallback(port);
    }
    __name(canonicalizePort, "canonicalizePort");
    function canonicalizeProtocol(protocol, isPattern) {
      protocol = maybeStripSuffix(protocol, ":");
      if (isPattern || protocol === "") {
        return protocol;
      }
      return protocolEncodeCallback(protocol);
    }
    __name(canonicalizeProtocol, "canonicalizeProtocol");
    function defaultPortForProtocol(protocol) {
      switch (protocol) {
        case "ws":
        case "http":
          return "80";
        case "wws":
        case "https":
          return "443";
        case "ftp":
          return "21";
        default:
          return "";
      }
    }
    __name(defaultPortForProtocol, "defaultPortForProtocol");
    function protocolEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      if (/^[-+.A-Za-z0-9]*$/.test(input))
        return input.toLowerCase();
      throw new TypeError(`Invalid protocol '${input}'.`);
    }
    __name(protocolEncodeCallback, "protocolEncodeCallback");
    function usernameEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      const url = new URL("https://example.com");
      url.username = input;
      return url.username;
    }
    __name(usernameEncodeCallback, "usernameEncodeCallback");
    function passwordEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      const url = new URL("https://example.com");
      url.password = input;
      return url.password;
    }
    __name(passwordEncodeCallback, "passwordEncodeCallback");
    function hostnameEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      if (/[\t\n\r #%/:<>?@[\]^\\|]/g.test(input)) {
        throw new TypeError(`Invalid hostname '${input}'`);
      }
      const url = new URL("https://example.com");
      url.hostname = input;
      return url.hostname;
    }
    __name(hostnameEncodeCallback, "hostnameEncodeCallback");
    function ipv6HostnameEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      if (/[^0-9a-fA-F[\]:]/g.test(input)) {
        throw new TypeError(`Invalid IPv6 hostname '${input}'`);
      }
      return input.toLowerCase();
    }
    __name(ipv6HostnameEncodeCallback, "ipv6HostnameEncodeCallback");
    function portEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      if (/^[0-9]*$/.test(input) && parseInt(input) <= 65535) {
        return input;
      }
      throw new TypeError(`Invalid port '${input}'.`);
    }
    __name(portEncodeCallback, "portEncodeCallback");
    function standardURLPathnameEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      const url = new URL("https://example.com");
      url.pathname = input[0] !== "/" ? "/-" + input : input;
      if (input[0] !== "/") {
        return url.pathname.substring(2, url.pathname.length);
      }
      return url.pathname;
    }
    __name(standardURLPathnameEncodeCallback, "standardURLPathnameEncodeCallback");
    function pathURLPathnameEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      const url = new URL(`data:${input}`);
      return url.pathname;
    }
    __name(pathURLPathnameEncodeCallback, "pathURLPathnameEncodeCallback");
    function searchEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      const url = new URL("https://example.com");
      url.search = input;
      return url.search.substring(1, url.search.length);
    }
    __name(searchEncodeCallback, "searchEncodeCallback");
    function hashEncodeCallback(input) {
      if (input === "") {
        return input;
      }
      const url = new URL("https://example.com");
      url.hash = input;
      return url.hash.substring(1, url.hash.length);
    }
    __name(hashEncodeCallback, "hashEncodeCallback");
    var Parser = /* @__PURE__ */ __name(class {
      constructor(input) {
        this.tokenList = [];
        this.internalResult = {};
        this.tokenIndex = 0;
        this.tokenIncrement = 1;
        this.componentStart = 0;
        this.state = 0;
        this.groupDepth = 0;
        this.hostnameIPv6BracketDepth = 0;
        this.shouldTreatAsStandardURL = false;
        this.input = input;
      }
      get result() {
        return this.internalResult;
      }
      parse() {
        this.tokenList = lexer(this.input, true);
        for (; this.tokenIndex < this.tokenList.length; this.tokenIndex += this.tokenIncrement) {
          this.tokenIncrement = 1;
          if (this.tokenList[this.tokenIndex].type === "END") {
            if (this.state === 0) {
              this.rewind();
              if (this.isHashPrefix()) {
                this.changeState(9, 1);
              } else if (this.isSearchPrefix()) {
                this.changeState(8, 1);
                this.internalResult.hash = "";
              } else {
                this.changeState(7, 0);
                this.internalResult.search = "";
                this.internalResult.hash = "";
              }
              continue;
            } else if (this.state === 2) {
              this.rewindAndSetState(5);
              continue;
            }
            this.changeState(10, 0);
            break;
          }
          if (this.groupDepth > 0) {
            if (this.isGroupClose()) {
              this.groupDepth -= 1;
            } else {
              continue;
            }
          }
          if (this.isGroupOpen()) {
            this.groupDepth += 1;
            continue;
          }
          switch (this.state) {
            case 0:
              if (this.isProtocolSuffix()) {
                this.internalResult.username = "";
                this.internalResult.password = "";
                this.internalResult.hostname = "";
                this.internalResult.port = "";
                this.internalResult.pathname = "";
                this.internalResult.search = "";
                this.internalResult.hash = "";
                this.rewindAndSetState(1);
              }
              break;
            case 1:
              if (this.isProtocolSuffix()) {
                this.computeShouldTreatAsStandardURL();
                let nextState = 7;
                let skip = 1;
                if (this.shouldTreatAsStandardURL) {
                  this.internalResult.pathname = "/";
                }
                if (this.nextIsAuthoritySlashes()) {
                  nextState = 2;
                  skip = 3;
                } else if (this.shouldTreatAsStandardURL) {
                  nextState = 2;
                }
                this.changeState(nextState, skip);
              }
              break;
            case 2:
              if (this.isIdentityTerminator()) {
                this.rewindAndSetState(3);
              } else if (this.isPathnameStart() || this.isSearchPrefix() || this.isHashPrefix()) {
                this.rewindAndSetState(5);
              }
              break;
            case 3:
              if (this.isPasswordPrefix()) {
                this.changeState(4, 1);
              } else if (this.isIdentityTerminator()) {
                this.changeState(5, 1);
              }
              break;
            case 4:
              if (this.isIdentityTerminator()) {
                this.changeState(5, 1);
              }
              break;
            case 5:
              if (this.isIPv6Open()) {
                this.hostnameIPv6BracketDepth += 1;
              } else if (this.isIPv6Close()) {
                this.hostnameIPv6BracketDepth -= 1;
              }
              if (this.isPortPrefix() && !this.hostnameIPv6BracketDepth) {
                this.changeState(6, 1);
              } else if (this.isPathnameStart()) {
                this.changeState(7, 0);
              } else if (this.isSearchPrefix()) {
                this.changeState(8, 1);
              } else if (this.isHashPrefix()) {
                this.changeState(9, 1);
              }
              break;
            case 6:
              if (this.isPathnameStart()) {
                this.changeState(7, 0);
              } else if (this.isSearchPrefix()) {
                this.changeState(8, 1);
              } else if (this.isHashPrefix()) {
                this.changeState(9, 1);
              }
              break;
            case 7:
              if (this.isSearchPrefix()) {
                this.changeState(8, 1);
              } else if (this.isHashPrefix()) {
                this.changeState(9, 1);
              }
              break;
            case 8:
              if (this.isHashPrefix()) {
                this.changeState(9, 1);
              }
              break;
            case 9:
              break;
            case 10:
              break;
          }
        }
      }
      changeState(newState, skip) {
        switch (this.state) {
          case 0:
            break;
          case 1:
            this.internalResult.protocol = this.makeComponentString();
            break;
          case 2:
            break;
          case 3:
            this.internalResult.username = this.makeComponentString();
            break;
          case 4:
            this.internalResult.password = this.makeComponentString();
            break;
          case 5:
            this.internalResult.hostname = this.makeComponentString();
            break;
          case 6:
            this.internalResult.port = this.makeComponentString();
            break;
          case 7:
            this.internalResult.pathname = this.makeComponentString();
            break;
          case 8:
            this.internalResult.search = this.makeComponentString();
            break;
          case 9:
            this.internalResult.hash = this.makeComponentString();
            break;
          case 10:
            break;
        }
        this.changeStateWithoutSettingComponent(newState, skip);
      }
      changeStateWithoutSettingComponent(newState, skip) {
        this.state = newState;
        this.componentStart = this.tokenIndex + skip;
        this.tokenIndex += skip;
        this.tokenIncrement = 0;
      }
      rewind() {
        this.tokenIndex = this.componentStart;
        this.tokenIncrement = 0;
      }
      rewindAndSetState(newState) {
        this.rewind();
        this.state = newState;
      }
      safeToken(index) {
        if (index < 0) {
          index = this.tokenList.length - index;
        }
        if (index < this.tokenList.length) {
          return this.tokenList[index];
        }
        return this.tokenList[this.tokenList.length - 1];
      }
      isNonSpecialPatternChar(index, value) {
        const token = this.safeToken(index);
        return token.value === value && (token.type === "CHAR" || token.type === "ESCAPED_CHAR" || token.type === "INVALID_CHAR");
      }
      isProtocolSuffix() {
        return this.isNonSpecialPatternChar(this.tokenIndex, ":");
      }
      nextIsAuthoritySlashes() {
        return this.isNonSpecialPatternChar(this.tokenIndex + 1, "/") && this.isNonSpecialPatternChar(this.tokenIndex + 2, "/");
      }
      isIdentityTerminator() {
        return this.isNonSpecialPatternChar(this.tokenIndex, "@");
      }
      isPasswordPrefix() {
        return this.isNonSpecialPatternChar(this.tokenIndex, ":");
      }
      isPortPrefix() {
        return this.isNonSpecialPatternChar(this.tokenIndex, ":");
      }
      isPathnameStart() {
        return this.isNonSpecialPatternChar(this.tokenIndex, "/");
      }
      isSearchPrefix() {
        if (this.isNonSpecialPatternChar(this.tokenIndex, "?")) {
          return true;
        }
        if (this.tokenList[this.tokenIndex].value !== "?") {
          return false;
        }
        const previousToken = this.safeToken(this.tokenIndex - 1);
        return previousToken.type !== "NAME" && previousToken.type !== "PATTERN" && previousToken.type !== "CLOSE" && previousToken.type !== "ASTERISK";
      }
      isHashPrefix() {
        return this.isNonSpecialPatternChar(this.tokenIndex, "#");
      }
      isGroupOpen() {
        return this.tokenList[this.tokenIndex].type == "OPEN";
      }
      isGroupClose() {
        return this.tokenList[this.tokenIndex].type == "CLOSE";
      }
      isIPv6Open() {
        return this.isNonSpecialPatternChar(this.tokenIndex, "[");
      }
      isIPv6Close() {
        return this.isNonSpecialPatternChar(this.tokenIndex, "]");
      }
      makeComponentString() {
        const token = this.tokenList[this.tokenIndex];
        const componentCharStart = this.safeToken(this.componentStart).index;
        return this.input.substring(componentCharStart, token.index);
      }
      computeShouldTreatAsStandardURL() {
        const options = {};
        Object.assign(options, DEFAULT_OPTIONS);
        options.encodePart = protocolEncodeCallback;
        const regexp = pathToRegexp(this.makeComponentString(), void 0, options);
        this.shouldTreatAsStandardURL = isSpecialScheme(regexp);
      }
    }, "Parser");
    var COMPONENTS = [
      "protocol",
      "username",
      "password",
      "hostname",
      "port",
      "pathname",
      "search",
      "hash"
    ];
    var DEFAULT_PATTERN = "*";
    function extractValues(url, baseURL) {
      if (typeof url !== "string") {
        throw new TypeError(`parameter 1 is not of type 'string'.`);
      }
      const o = new URL(url, baseURL);
      return {
        protocol: o.protocol.substring(0, o.protocol.length - 1),
        username: o.username,
        password: o.password,
        hostname: o.hostname,
        port: o.port,
        pathname: o.pathname,
        search: o.search != "" ? o.search.substring(1, o.search.length) : void 0,
        hash: o.hash != "" ? o.hash.substring(1, o.hash.length) : void 0
      };
    }
    __name(extractValues, "extractValues");
    function applyInit(o, init, isPattern) {
      let baseURL;
      if (typeof init.baseURL === "string") {
        try {
          baseURL = new URL(init.baseURL);
          o.protocol = baseURL.protocol ? baseURL.protocol.substring(0, baseURL.protocol.length - 1) : "";
          o.username = baseURL.username;
          o.password = baseURL.password;
          o.hostname = baseURL.hostname;
          o.port = baseURL.port;
          o.pathname = baseURL.pathname;
          o.search = baseURL.search ? baseURL.search.substring(1, baseURL.search.length) : "";
          o.hash = baseURL.hash ? baseURL.hash.substring(1, baseURL.hash.length) : "";
        } catch {
          throw new TypeError(`invalid baseURL '${init.baseURL}'.`);
        }
      }
      if (typeof init.protocol === "string") {
        o.protocol = canonicalizeProtocol(init.protocol, isPattern);
      }
      if (typeof init.username === "string") {
        o.username = canonicalizeUsername(init.username, isPattern);
      }
      if (typeof init.password === "string") {
        o.password = canonicalizePassword(init.password, isPattern);
      }
      if (typeof init.hostname === "string") {
        o.hostname = canonicalizeHostname(init.hostname, isPattern);
      }
      if (typeof init.port === "string") {
        o.port = canonicalizePort(init.port, o.protocol, isPattern);
      }
      if (typeof init.pathname === "string") {
        o.pathname = init.pathname;
        if (baseURL && !isAbsolutePathname(o.pathname, isPattern)) {
          const slashIndex = baseURL.pathname.lastIndexOf("/");
          if (slashIndex >= 0) {
            o.pathname = baseURL.pathname.substring(0, slashIndex + 1) + o.pathname;
          }
        }
        o.pathname = canonicalizePathname(o.pathname, o.protocol, isPattern);
      }
      if (typeof init.search === "string") {
        o.search = canonicalizeSearch(init.search, isPattern);
      }
      if (typeof init.hash === "string") {
        o.hash = canonicalizeHash(init.hash, isPattern);
      }
      return o;
    }
    __name(applyInit, "applyInit");
    function escapePatternString(value) {
      return value.replace(/([+*?:{}()\\])/g, "\\$1");
    }
    __name(escapePatternString, "escapePatternString");
    function escapeRegexpString(value) {
      return value.replace(/([.+*?^${}()[\]|/\\])/g, "\\$1");
    }
    __name(escapeRegexpString, "escapeRegexpString");
    function tokensToPattern(tokens, options) {
      var _a2;
      const wildcardPattern = ".*";
      const segmentWildcardPattern = `[^${escapeRegexpString((_a2 = options.delimiter) != null ? _a2 : "/#?")}]+?`;
      const regexIdentifierPart2 = /[$_\u200C\u200D\p{ID_Continue}]/u;
      let result = "";
      for (let i = 0; i < tokens.length; ++i) {
        const token = tokens[i];
        const lastToken = i > 0 ? tokens[i - 1] : null;
        const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;
        if (typeof token === "string") {
          result += escapePatternString(token);
          continue;
        }
        if (token.pattern === "") {
          if (token.modifier === "") {
            result += escapePatternString(token.prefix);
            continue;
          }
          result += `{${escapePatternString(token.prefix)}}${token.modifier}`;
          continue;
        }
        const customName = typeof token.name !== "number";
        const optionsPrefixes = options.prefixes !== void 0 ? options.prefixes : "./";
        let needsGrouping = token.suffix !== "" || token.prefix !== "" && (token.prefix.length !== 1 || !optionsPrefixes.includes(token.prefix));
        if (!needsGrouping && customName && token.pattern === segmentWildcardPattern && token.modifier === "" && nextToken && !nextToken.prefix && !nextToken.suffix) {
          if (typeof nextToken === "string") {
            const code = nextToken.length > 0 ? nextToken[0] : "";
            needsGrouping = regexIdentifierPart2.test(code);
          } else {
            needsGrouping = typeof nextToken.name === "number";
          }
        }
        if (!needsGrouping && token.prefix === "" && lastToken && typeof lastToken === "string" && lastToken.length > 0) {
          const code = lastToken[lastToken.length - 1];
          needsGrouping = optionsPrefixes.includes(code);
        }
        if (needsGrouping) {
          result += "{";
        }
        result += escapePatternString(token.prefix);
        if (customName) {
          result += `:${token.name}`;
        }
        if (token.pattern === wildcardPattern) {
          if (!customName && (!lastToken || typeof lastToken === "string" || lastToken.modifier || needsGrouping || token.prefix !== "")) {
            result += "*";
          } else {
            result += `(${wildcardPattern})`;
          }
        } else if (token.pattern === segmentWildcardPattern) {
          if (!customName) {
            result += `(${segmentWildcardPattern})`;
          }
        } else {
          result += `(${token.pattern})`;
        }
        if (token.pattern === segmentWildcardPattern && customName && token.suffix !== "") {
          if (regexIdentifierPart2.test(token.suffix[0])) {
            result += "\\";
          }
        }
        result += escapePatternString(token.suffix);
        if (needsGrouping) {
          result += "}";
        }
        result += token.modifier;
      }
      return result;
    }
    __name(tokensToPattern, "tokensToPattern");
    var URLPattern = /* @__PURE__ */ __name(class {
      constructor(init = {}, baseURL) {
        this.regexp = {};
        this.keys = {};
        this.component_pattern = {};
        try {
          if (typeof init === "string") {
            const parser = new Parser(init);
            parser.parse();
            init = parser.result;
            if (baseURL) {
              if (typeof baseURL === "string") {
                init.baseURL = baseURL;
              } else {
                throw new TypeError(`'baseURL' parameter is not of type 'string'.`);
              }
            } else if (typeof init.protocol !== "string") {
              throw new TypeError(`A base URL must be provided for a relative constructor string.`);
            }
          } else if (baseURL) {
            throw new TypeError(`parameter 1 is not of type 'string'.`);
          }
          if (!init || typeof init !== "object") {
            throw new TypeError(`parameter 1 is not of type 'string' and cannot convert to dictionary.`);
          }
          const defaults = {
            pathname: DEFAULT_PATTERN,
            protocol: DEFAULT_PATTERN,
            username: DEFAULT_PATTERN,
            password: DEFAULT_PATTERN,
            hostname: DEFAULT_PATTERN,
            port: DEFAULT_PATTERN,
            search: DEFAULT_PATTERN,
            hash: DEFAULT_PATTERN
          };
          this.pattern = applyInit(defaults, init, true);
          if (defaultPortForProtocol(this.pattern.protocol) === this.pattern.port) {
            this.pattern.port = "";
          }
          let component;
          for (component of COMPONENTS) {
            if (!(component in this.pattern))
              continue;
            const options = {};
            const pattern = this.pattern[component];
            this.keys[component] = [];
            switch (component) {
              case "protocol":
                Object.assign(options, DEFAULT_OPTIONS);
                options.encodePart = protocolEncodeCallback;
                break;
              case "username":
                Object.assign(options, DEFAULT_OPTIONS);
                options.encodePart = usernameEncodeCallback;
                break;
              case "password":
                Object.assign(options, DEFAULT_OPTIONS);
                options.encodePart = passwordEncodeCallback;
                break;
              case "hostname":
                Object.assign(options, HOSTNAME_OPTIONS);
                if (treatAsIPv6Hostname(pattern)) {
                  options.encodePart = ipv6HostnameEncodeCallback;
                } else {
                  options.encodePart = hostnameEncodeCallback;
                }
                break;
              case "port":
                Object.assign(options, DEFAULT_OPTIONS);
                options.encodePart = portEncodeCallback;
                break;
              case "pathname":
                if (isSpecialScheme(this.regexp.protocol)) {
                  Object.assign(options, PATHNAME_OPTIONS);
                  options.encodePart = standardURLPathnameEncodeCallback;
                } else {
                  Object.assign(options, DEFAULT_OPTIONS);
                  options.encodePart = pathURLPathnameEncodeCallback;
                }
                break;
              case "search":
                Object.assign(options, DEFAULT_OPTIONS);
                options.encodePart = searchEncodeCallback;
                break;
              case "hash":
                Object.assign(options, DEFAULT_OPTIONS);
                options.encodePart = hashEncodeCallback;
                break;
            }
            try {
              const tokens = parse(pattern, options);
              this.regexp[component] = tokensToRegexp(tokens, this.keys[component], options);
              this.component_pattern[component] = tokensToPattern(tokens, options);
            } catch {
              throw new TypeError(`invalid ${component} pattern '${this.pattern[component]}'.`);
            }
          }
        } catch (err) {
          throw new TypeError(`Failed to construct 'URLPattern': ${err.message}`);
        }
      }
      test(input = {}, baseURL) {
        let values = {
          pathname: "",
          protocol: "",
          username: "",
          password: "",
          hostname: "",
          port: "",
          search: "",
          hash: ""
        };
        if (typeof input !== "string" && baseURL) {
          throw new TypeError(`parameter 1 is not of type 'string'.`);
        }
        if (typeof input === "undefined") {
          return false;
        }
        try {
          if (typeof input === "object") {
            values = applyInit(values, input, false);
          } else {
            values = applyInit(values, extractValues(input, baseURL), false);
          }
        } catch (err) {
          return false;
        }
        let component;
        for (component in this.pattern) {
          if (!this.regexp[component].exec(values[component])) {
            return false;
          }
        }
        return true;
      }
      exec(input = {}, baseURL) {
        let values = {
          pathname: "",
          protocol: "",
          username: "",
          password: "",
          hostname: "",
          port: "",
          search: "",
          hash: ""
        };
        if (typeof input !== "string" && baseURL) {
          throw new TypeError(`parameter 1 is not of type 'string'.`);
        }
        if (typeof input === "undefined") {
          return;
        }
        try {
          if (typeof input === "object") {
            values = applyInit(values, input, false);
          } else {
            values = applyInit(values, extractValues(input, baseURL), false);
          }
        } catch (err) {
          return null;
        }
        let result = {};
        if (baseURL) {
          result.inputs = [input, baseURL];
        } else {
          result.inputs = [input];
        }
        let component;
        for (component in this.pattern) {
          let match = this.regexp[component].exec(values[component]);
          if (!match) {
            return null;
          }
          let groups = {};
          for (let [i, key] of this.keys[component].entries()) {
            if (typeof key.name === "string" || typeof key.name === "number") {
              let value = match[i + 1];
              groups[key.name] = value;
            }
          }
          result[component] = {
            input: values[component] || "",
            groups
          };
        }
        return result;
      }
      get protocol() {
        return this.component_pattern.protocol;
      }
      get username() {
        return this.component_pattern.username;
      }
      get password() {
        return this.component_pattern.password;
      }
      get hostname() {
        return this.component_pattern.hostname;
      }
      get port() {
        return this.component_pattern.port;
      }
      get pathname() {
        return this.component_pattern.pathname;
      }
      get search() {
        return this.component_pattern.search;
      }
      get hash() {
        return this.component_pattern.hash;
      }
    }, "URLPattern");
  }
});

// ../../node_modules/.pnpm/urlpattern-polyfill@5.0.3/node_modules/urlpattern-polyfill/index.cjs
var require_urlpattern_polyfill = __commonJS({
  "../../node_modules/.pnpm/urlpattern-polyfill@5.0.3/node_modules/urlpattern-polyfill/index.cjs"(exports, module2) {
    var { URLPattern } = require_urlpattern();
    module2.exports = { URLPattern };
    if (!globalThis.URLPattern) {
      globalThis.URLPattern = URLPattern;
    }
  }
});

// ../format/dist/index.js
var require_dist2 = __commonJS({
  "../format/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createFormat = void 0;
    function createFormat(opts = {}) {
      if (opts.customInspectSymbol === void 0) {
        opts.customInspectSymbol = Symbol.for("edge-runtime.inspect.custom");
      }
      if (opts.formatError === void 0) {
        opts.formatError = (error) => `[${Error.prototype.toString.call(error)}]`;
      }
      const { formatError, customInspectSymbol } = opts;
      function format(...args) {
        const [firstArg] = args;
        if (!kind(firstArg, "string")) {
          if (hasCustomSymbol(firstArg, customInspectSymbol)) {
            return format(firstArg[customInspectSymbol]());
          } else {
            return args.map((item) => inspect(item, { customInspectSymbol })).join(" ");
          }
        }
        let index = 1;
        let str = String(firstArg).replace(/%[sjdOoif%]/g, (token) => {
          if (token === "%%")
            return "%";
          if (index >= args.length)
            return token;
          switch (token) {
            case "%s": {
              const arg = args[index++];
              return hasCustomSymbol(arg, customInspectSymbol) ? format(arg[customInspectSymbol]()) : String(arg);
            }
            case "%j":
              return safeStringify(args[index++]);
            case "%d":
              return String(Number(args[index++]));
            case "%O":
              return inspect(args[index++], { customInspectSymbol });
            case "%o":
              return inspect(args[index++], {
                customInspectSymbol,
                showHidden: true,
                depth: 4
              });
            case "%i":
              return String(parseInt(args[index++], 10));
            case "%f":
              return String(parseFloat(args[index++]));
            default:
              return token;
          }
        });
        for (let arg = args[index]; index < args.length; arg = args[++index]) {
          if (arg === null || !kind(arg, "object")) {
            str += " " + arg;
          } else {
            str += " " + inspect(arg);
          }
        }
        return str;
      }
      __name(format, "format");
      function formatValue(ctx, value, recurseTimes) {
        if (hasCustomSymbol(value, customInspectSymbol)) {
          return format(value[customInspectSymbol]());
        }
        const formattedPrimitive = formatPrimitive(value);
        if (formattedPrimitive !== void 0) {
          return formattedPrimitive;
        }
        const keys = ctx.showHidden ? Object.getOwnPropertyNames(value) : Object.keys(value);
        const visibleKeys = /* @__PURE__ */ new Set();
        keys.forEach((key) => visibleKeys.add(key));
        if (keys.length === 0) {
          if (kind(value, "function")) {
            return `[Function${value.name ? ": " + value.name : ""}]`;
          } else if (isRegExp(value)) {
            return RegExp.prototype.toString.call(value);
          } else if (isDate(value)) {
            return Date.prototype.toString.call(value);
          } else if (isError(value)) {
            return formatError(value);
          } else if (hasCustomSymbol(value, ctx.customInspectSymbol)) {
            return format(value[ctx.customInspectSymbol]());
          }
        }
        let base = "";
        if (kind(value, "function")) {
          base = `[Function${value.name ? ": " + value.name : ""}]`;
        } else if (isRegExp(value)) {
          base = " " + RegExp.prototype.toString.call(value);
        } else if (isDate(value)) {
          base = " " + Date.prototype.toUTCString.call(value);
        } else if (isError(value)) {
          base = " " + formatError(value);
        } else if (hasCustomSymbol(value, ctx.customInspectSymbol)) {
          base = " " + value[ctx.customInspectSymbol]();
        }
        const braces = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
        if (keys.length === 0 && (!Array.isArray(value) || value.length === 0)) {
          return braces[0] + base + braces[1];
        }
        if (recurseTimes && recurseTimes < 0) {
          return isRegExp(value) ? RegExp.prototype.toString.call(value) : "[Object]";
        }
        ctx.seen.push(value);
        const output = Array.isArray(value) ? formatArray(ctx, value, recurseTimes, visibleKeys, keys) : keys.map((key) => formatProperty(ctx, value, recurseTimes, visibleKeys, key, false));
        ctx.seen.pop();
        return reduceToSingleString(output, base, braces);
      }
      __name(formatValue, "formatValue");
      function inspect(value, opts2) {
        opts2 = Object.assign({ seen: [], depth: 2 }, opts2);
        return formatValue(opts2, value, opts2.depth);
      }
      __name(inspect, "inspect");
      function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
        let name;
        let str;
        const desc = Object.getOwnPropertyDescriptor(value, key) || {
          value: value[key]
        };
        if (desc.get) {
          str = desc.set ? "[Getter/Setter]" : "[Getter]";
        } else if (desc.set) {
          str = "[Setter]";
        }
        if (!visibleKeys.has(key)) {
          name = "[" + key + "]";
        }
        if (!str) {
          if (ctx.seen.indexOf(desc.value) < 0) {
            str = formatValue(ctx, desc.value, recurseTimes === null || recurseTimes === void 0 ? null : recurseTimes - 1);
            if (str.indexOf("\n") > -1) {
              if (array) {
                str = str.split("\n").map((line) => `  ${line}`).join("\n").slice(2);
              } else {
                str = "\n" + str.split("\n").map((line) => `   ${line}`).join("\n");
              }
            }
          } else {
            str = "[Circular]";
          }
        }
        if (name === void 0) {
          if (array && key.match(/^\d+$/)) {
            return str;
          }
          name = JSON.stringify("" + key);
          if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
            name = name.slice(1, -1);
          } else {
            name = name.replace(/'/g, "\\'").replace(/\\"/g, '"').replace(/(^"|"$)/g, "'");
          }
        }
        return `${name}: ${str}`;
      }
      __name(formatProperty, "formatProperty");
      function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
        const output = [];
        for (let index = 0; index < value.length; ++index) {
          if (Object.prototype.hasOwnProperty.call(value, String(index))) {
            output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, String(index), true));
          } else {
            output.push("");
          }
        }
        keys.forEach((key) => {
          if (!key.match(/^\d+$/)) {
            output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, key, true));
          }
        });
        return output;
      }
      __name(formatArray, "formatArray");
      return format;
    }
    __name(createFormat, "createFormat");
    exports.createFormat = createFormat;
    function formatPrimitive(value) {
      if (value === null)
        return "null";
      if (value === void 0)
        return "undefined";
      if (kind(value, "string")) {
        return `'${JSON.stringify(value).replace(/^"|"$/g, "").replace(/'/g, "\\'").replace(/\\"/g, '"')}'`;
      }
      if (kind(value, "boolean"))
        return "" + value;
      if (kind(value, "number"))
        return "" + value;
      if (kind(value, "bigint"))
        return "" + value;
      if (kind(value, "symbol"))
        return value.toString();
    }
    __name(formatPrimitive, "formatPrimitive");
    function hasCustomSymbol(value, customInspectSymbol) {
      return value !== null && kind(value, "object") && customInspectSymbol in value && kind(value[customInspectSymbol], "function");
    }
    __name(hasCustomSymbol, "hasCustomSymbol");
    function kind(value, type) {
      return typeof value === type;
    }
    __name(kind, "kind");
    function isRegExp(value) {
      return kind(value, "object") && Object.prototype.toString.call(value) === "[object RegExp]";
    }
    __name(isRegExp, "isRegExp");
    function isDate(value) {
      return kind(value, "object") && Object.prototype.toString.call(value) === "[object Date]";
    }
    __name(isDate, "isDate");
    function isError(value) {
      return kind(value, "object") && (Object.prototype.toString.call(value) === "[object Error]" || value instanceof Error);
    }
    __name(isError, "isError");
    function reduceToSingleString(output, base, braces) {
      const length = output.reduce((prev, cur) => {
        return prev + cur.replace(/\u001b\[\d\d?m/g, "").length + 1;
      }, 0);
      if (length > 60) {
        return braces[0] + (base === "" ? "" : base + "\n ") + " " + output.join(",\n  ") + " " + braces[1];
      }
      return braces[0] + base + " " + output.join(", ") + " " + braces[1];
    }
    __name(reduceToSingleString, "reduceToSingleString");
    function safeStringify(object) {
      if (Array.isArray(object)) {
        object = object.map((element) => JSON.parse(JSON.stringify(element, makeCircularReplacer())));
      }
      return JSON.stringify(object, makeCircularReplacer());
    }
    __name(safeStringify, "safeStringify");
    function makeCircularReplacer() {
      const seen = /* @__PURE__ */ new WeakSet();
      return (key, value) => {
        if (value !== null && kind(value, "object")) {
          if (seen.has(value))
            return "[Circular]";
          seen.add(value);
        }
        return value;
      };
    }
    __name(makeCircularReplacer, "makeCircularReplacer");
  }
});

// src/polyfills/console.js
var require_console = __commonJS({
  "src/polyfills/console.js"(exports, module2) {
    "use strict";
    var { createFormat } = require_dist2();
    var format = createFormat();
    var error = /* @__PURE__ */ __name((...args) => console.error(format(...args)), "error");
    var log = /* @__PURE__ */ __name((...args) => console.log(format(...args)), "log");
    module2.exports = {
      assert: (assertion, ...args) => console.assert(assertion, format(...args)),
      count: console.count.bind(console),
      debug: log,
      dir: (...args) => console.dir(...args),
      error,
      info: log,
      log,
      time: (...args) => console.time(format(...args)),
      timeEnd: (...args) => console.timeEnd(format(...args)),
      timeLog: (...args) => console.timeLog(...args),
      trace: (...args) => console.trace(...args),
      warn: error
    };
  }
});

// src/index.js
var src_exports = {};
__export(src_exports, {
  addPrimitives: () => addPrimitives,
  default: () => src_default
});
module.exports = __toCommonJS(src_exports);
var { defineEnumerableProperties } = require_utils();
function addPrimitives(context) {
  defineEnumerableProperties(context, {
    globalThis: context,
    self: context
  });
  const abort = require_abort_controller();
  defineEnumerableProperties(context, {
    AbortController: abort.AbortController,
    AbortSignal: abort.AbortSignal
  });
  const { default: aggregate } = require_cjs();
  defineEnumerableProperties(context, {
    AggregateError: aggregate
  });
  const base64 = require_base64();
  defineEnumerableProperties(context, {
    atob: base64.atob,
    btoa: base64.btoa
  });
  const buffer = require_buffer();
  defineEnumerableProperties(context, {
    Blob: buffer.Blob
  });
  const webCrypto = require_web_crypto();
  defineEnumerableProperties(context, {
    crypto: new webCrypto.Crypto(),
    Crypto: webCrypto.Crypto,
    CryptoKey: webCrypto.CryptoKey,
    SubtleCrypto: webCrypto.SubtleCrypto
  });
  const undici = require_undici();
  defineEnumerableProperties(context, {
    fetch: undici.fetch,
    File: undici.File,
    FormData: undici.FormData,
    Headers: undici.Headers,
    Request: undici.Request,
    Response: undici.Response
  });
  const webCache = require_cache();
  defineEnumerableProperties(context, {
    caches: webCache(undici).cacheStorage(),
    CacheStorage: webCache.CacheStorage,
    Cache: webCache.Cache
  });
  const webEvent = require_web_event();
  defineEnumerableProperties(context, {
    Event: webEvent.Event,
    EventTarget: webEvent.EventTarget,
    FetchEvent: webEvent.FetchEvent,
    PromiseRejectionEvent: webEvent.PromiseRejectionEvent
  });
  const webStreams = require_web_streams();
  defineEnumerableProperties(context, {
    ReadableStream: webStreams.ReadableStream,
    ReadableStreamBYOBReader: webStreams.ReadableStreamBYOBReader,
    ReadableStreamDefaultReader: webStreams.ReadableStreamDefaultReader,
    TransformStream: webStreams.TransformStream,
    WritableStream: webStreams.WritableStream,
    WritableStreamDefaultWriter: webStreams.WritableStreamDefaultWriter
  });
  const structuredClone2 = require_cjs3();
  defineEnumerableProperties(context, { structuredClone: structuredClone2 });
  const { URLPattern } = require_urlpattern_polyfill();
  defineEnumerableProperties(context, { URLPattern });
  defineEnumerableProperties(context, {
    Array,
    ArrayBuffer,
    Atomics,
    BigInt,
    BigInt64Array,
    BigUint64Array,
    Boolean,
    clearInterval,
    clearTimeout,
    console: require_console(),
    DataView,
    Date,
    decodeURI,
    decodeURIComponent,
    encodeURI,
    encodeURIComponent,
    Error,
    EvalError,
    Float32Array,
    Float64Array,
    Function,
    Infinity: Infinity,
    Int8Array,
    Int16Array,
    Int32Array,
    Intl,
    isFinite,
    isNaN,
    JSON,
    Map,
    Math,
    Number,
    Object,
    parseFloat,
    parseInt,
    Promise,
    Proxy,
    RangeError,
    ReferenceError,
    Reflect,
    RegExp,
    Set,
    setInterval,
    setTimeout,
    SharedArrayBuffer,
    String,
    Symbol,
    SyntaxError,
    TextDecoder,
    TextEncoder,
    TypeError,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    URIError,
    URL,
    URLPattern,
    URLSearchParams,
    WeakMap,
    WeakSet,
    WebAssembly
  });
  return context;
}
__name(addPrimitives, "addPrimitives");
var src_default = addPrimitives(/* @__PURE__ */ Object.create(null));
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  addPrimitives
});
