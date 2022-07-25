var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// <define:process>
var init_define_process = __esm({
  "<define:process>"() {
  }
});

// ../../node_modules/.pnpm/event-target-shim@5.0.1/node_modules/event-target-shim/dist/event-target-shim.js
var require_event_target_shim = __commonJS({
  "../../node_modules/.pnpm/event-target-shim@5.0.1/node_modules/event-target-shim/dist/event-target-shim.js"(exports, module2) {
    "use strict";
    init_define_process();
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
    init_define_process();
    Object.defineProperty(exports, "__esModule", { value: true });
    var eventTargetShim = require_event_target_shim();
    var AbortSignal2 = class extends eventTargetShim.EventTarget {
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
    __name(AbortSignal2, "AbortSignal");
    eventTargetShim.defineEventAttribute(AbortSignal2.prototype, "abort");
    function createAbortSignal() {
      const signal = Object.create(AbortSignal2.prototype);
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
    Object.defineProperties(AbortSignal2.prototype, {
      aborted: { enumerable: true }
    });
    if (typeof Symbol === "function" && typeof Symbol.toStringTag === "symbol") {
      Object.defineProperty(AbortSignal2.prototype, Symbol.toStringTag, {
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
    exports.AbortSignal = AbortSignal2;
    exports.default = AbortController2;
    module2.exports = AbortController2;
    module2.exports.AbortController = module2.exports["default"] = AbortController2;
    module2.exports.AbortSignal = AbortSignal2;
  }
});

// src/primitives/abort-controller.js
var abort_controller_exports = {};
__export(abort_controller_exports, {
  AbortController: () => import_abort_controller.AbortController,
  AbortSignal: () => import_abort_controller.AbortSignal
});
module.exports = __toCommonJS(abort_controller_exports);
init_define_process();
var import_abort_controller = __toESM(require_abort_controller());
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AbortController,
  AbortSignal
});
