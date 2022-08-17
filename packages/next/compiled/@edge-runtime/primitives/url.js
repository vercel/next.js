var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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

// ../../node_modules/.pnpm/webidl-conversions@7.0.0/node_modules/webidl-conversions/lib/index.js
var require_lib = __commonJS({
  "../../node_modules/.pnpm/webidl-conversions@7.0.0/node_modules/webidl-conversions/lib/index.js"(exports) {
    "use strict";
    init_define_process();
    function makeException(ErrorType, message, options) {
      if (options.globals) {
        ErrorType = options.globals[ErrorType.name];
      }
      return new ErrorType(`${options.context ? options.context : "Value"} ${message}.`);
    }
    __name(makeException, "makeException");
    function toNumber(value, options) {
      if (typeof value === "bigint") {
        throw makeException(TypeError, "is a BigInt which cannot be converted to a number", options);
      }
      if (!options.globals) {
        return Number(value);
      }
      return options.globals.Number(value);
    }
    __name(toNumber, "toNumber");
    function evenRound(x) {
      if (x > 0 && x % 1 === 0.5 && (x & 1) === 0 || x < 0 && x % 1 === -0.5 && (x & 1) === 1) {
        return censorNegativeZero(Math.floor(x));
      }
      return censorNegativeZero(Math.round(x));
    }
    __name(evenRound, "evenRound");
    function integerPart(n) {
      return censorNegativeZero(Math.trunc(n));
    }
    __name(integerPart, "integerPart");
    function sign(x) {
      return x < 0 ? -1 : 1;
    }
    __name(sign, "sign");
    function modulo(x, y) {
      const signMightNotMatch = x % y;
      if (sign(y) !== sign(signMightNotMatch)) {
        return signMightNotMatch + y;
      }
      return signMightNotMatch;
    }
    __name(modulo, "modulo");
    function censorNegativeZero(x) {
      return x === 0 ? 0 : x;
    }
    __name(censorNegativeZero, "censorNegativeZero");
    function createIntegerConversion(bitLength, { unsigned }) {
      let lowerBound, upperBound;
      if (unsigned) {
        lowerBound = 0;
        upperBound = 2 ** bitLength - 1;
      } else {
        lowerBound = -(2 ** (bitLength - 1));
        upperBound = 2 ** (bitLength - 1) - 1;
      }
      const twoToTheBitLength = 2 ** bitLength;
      const twoToOneLessThanTheBitLength = 2 ** (bitLength - 1);
      return (value, options = {}) => {
        let x = toNumber(value, options);
        x = censorNegativeZero(x);
        if (options.enforceRange) {
          if (!Number.isFinite(x)) {
            throw makeException(TypeError, "is not a finite number", options);
          }
          x = integerPart(x);
          if (x < lowerBound || x > upperBound) {
            throw makeException(TypeError, `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`, options);
          }
          return x;
        }
        if (!Number.isNaN(x) && options.clamp) {
          x = Math.min(Math.max(x, lowerBound), upperBound);
          x = evenRound(x);
          return x;
        }
        if (!Number.isFinite(x) || x === 0) {
          return 0;
        }
        x = integerPart(x);
        if (x >= lowerBound && x <= upperBound) {
          return x;
        }
        x = modulo(x, twoToTheBitLength);
        if (!unsigned && x >= twoToOneLessThanTheBitLength) {
          return x - twoToTheBitLength;
        }
        return x;
      };
    }
    __name(createIntegerConversion, "createIntegerConversion");
    function createLongLongConversion(bitLength, { unsigned }) {
      const upperBound = Number.MAX_SAFE_INTEGER;
      const lowerBound = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
      const asBigIntN = unsigned ? BigInt.asUintN : BigInt.asIntN;
      return (value, options = {}) => {
        let x = toNumber(value, options);
        x = censorNegativeZero(x);
        if (options.enforceRange) {
          if (!Number.isFinite(x)) {
            throw makeException(TypeError, "is not a finite number", options);
          }
          x = integerPart(x);
          if (x < lowerBound || x > upperBound) {
            throw makeException(TypeError, `is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`, options);
          }
          return x;
        }
        if (!Number.isNaN(x) && options.clamp) {
          x = Math.min(Math.max(x, lowerBound), upperBound);
          x = evenRound(x);
          return x;
        }
        if (!Number.isFinite(x) || x === 0) {
          return 0;
        }
        let xBigInt = BigInt(integerPart(x));
        xBigInt = asBigIntN(bitLength, xBigInt);
        return Number(xBigInt);
      };
    }
    __name(createLongLongConversion, "createLongLongConversion");
    exports.any = (value) => {
      return value;
    };
    exports.undefined = () => {
      return void 0;
    };
    exports.boolean = (value) => {
      return Boolean(value);
    };
    exports.byte = createIntegerConversion(8, { unsigned: false });
    exports.octet = createIntegerConversion(8, { unsigned: true });
    exports.short = createIntegerConversion(16, { unsigned: false });
    exports["unsigned short"] = createIntegerConversion(16, { unsigned: true });
    exports.long = createIntegerConversion(32, { unsigned: false });
    exports["unsigned long"] = createIntegerConversion(32, { unsigned: true });
    exports["long long"] = createLongLongConversion(64, { unsigned: false });
    exports["unsigned long long"] = createLongLongConversion(64, { unsigned: true });
    exports.double = (value, options = {}) => {
      const x = toNumber(value, options);
      if (!Number.isFinite(x)) {
        throw makeException(TypeError, "is not a finite floating-point value", options);
      }
      return x;
    };
    exports["unrestricted double"] = (value, options = {}) => {
      const x = toNumber(value, options);
      return x;
    };
    exports.float = (value, options = {}) => {
      const x = toNumber(value, options);
      if (!Number.isFinite(x)) {
        throw makeException(TypeError, "is not a finite floating-point value", options);
      }
      if (Object.is(x, -0)) {
        return x;
      }
      const y = Math.fround(x);
      if (!Number.isFinite(y)) {
        throw makeException(TypeError, "is outside the range of a single-precision floating-point value", options);
      }
      return y;
    };
    exports["unrestricted float"] = (value, options = {}) => {
      const x = toNumber(value, options);
      if (isNaN(x)) {
        return x;
      }
      if (Object.is(x, -0)) {
        return x;
      }
      return Math.fround(x);
    };
    exports.DOMString = (value, options = {}) => {
      if (options.treatNullAsEmptyString && value === null) {
        return "";
      }
      if (typeof value === "symbol") {
        throw makeException(TypeError, "is a symbol, which cannot be converted to a string", options);
      }
      const StringCtor = options.globals ? options.globals.String : String;
      return StringCtor(value);
    };
    exports.ByteString = (value, options = {}) => {
      const x = exports.DOMString(value, options);
      let c;
      for (let i = 0; (c = x.codePointAt(i)) !== void 0; ++i) {
        if (c > 255) {
          throw makeException(TypeError, "is not a valid ByteString", options);
        }
      }
      return x;
    };
    exports.USVString = (value, options = {}) => {
      const S = exports.DOMString(value, options);
      const n = S.length;
      const U = [];
      for (let i = 0; i < n; ++i) {
        const c = S.charCodeAt(i);
        if (c < 55296 || c > 57343) {
          U.push(String.fromCodePoint(c));
        } else if (56320 <= c && c <= 57343) {
          U.push(String.fromCodePoint(65533));
        } else if (i === n - 1) {
          U.push(String.fromCodePoint(65533));
        } else {
          const d = S.charCodeAt(i + 1);
          if (56320 <= d && d <= 57343) {
            const a = c & 1023;
            const b = d & 1023;
            U.push(String.fromCodePoint((2 << 15) + (2 << 9) * a + b));
            ++i;
          } else {
            U.push(String.fromCodePoint(65533));
          }
        }
      }
      return U.join("");
    };
    exports.object = (value, options = {}) => {
      if (value === null || typeof value !== "object" && typeof value !== "function") {
        throw makeException(TypeError, "is not an object", options);
      }
      return value;
    };
    var abByteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
    var sabByteLengthGetter = typeof SharedArrayBuffer === "function" ? Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, "byteLength").get : null;
    function isNonSharedArrayBuffer(value) {
      try {
        abByteLengthGetter.call(value);
        return true;
      } catch {
        return false;
      }
    }
    __name(isNonSharedArrayBuffer, "isNonSharedArrayBuffer");
    function isSharedArrayBuffer(value) {
      try {
        sabByteLengthGetter.call(value);
        return true;
      } catch {
        return false;
      }
    }
    __name(isSharedArrayBuffer, "isSharedArrayBuffer");
    function isArrayBufferDetached(value) {
      try {
        new Uint8Array(value);
        return false;
      } catch {
        return true;
      }
    }
    __name(isArrayBufferDetached, "isArrayBufferDetached");
    exports.ArrayBuffer = (value, options = {}) => {
      if (!isNonSharedArrayBuffer(value)) {
        if (options.allowShared && !isSharedArrayBuffer(value)) {
          throw makeException(TypeError, "is not an ArrayBuffer or SharedArrayBuffer", options);
        }
        throw makeException(TypeError, "is not an ArrayBuffer", options);
      }
      if (isArrayBufferDetached(value)) {
        throw makeException(TypeError, "is a detached ArrayBuffer", options);
      }
      return value;
    };
    var dvByteLengthGetter = Object.getOwnPropertyDescriptor(DataView.prototype, "byteLength").get;
    exports.DataView = (value, options = {}) => {
      try {
        dvByteLengthGetter.call(value);
      } catch (e) {
        throw makeException(TypeError, "is not a DataView", options);
      }
      if (!options.allowShared && isSharedArrayBuffer(value.buffer)) {
        throw makeException(TypeError, "is backed by a SharedArrayBuffer, which is not allowed", options);
      }
      if (isArrayBufferDetached(value.buffer)) {
        throw makeException(TypeError, "is backed by a detached ArrayBuffer", options);
      }
      return value;
    };
    var typedArrayNameGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array).prototype, Symbol.toStringTag).get;
    [
      Int8Array,
      Int16Array,
      Int32Array,
      Uint8Array,
      Uint16Array,
      Uint32Array,
      Uint8ClampedArray,
      Float32Array,
      Float64Array
    ].forEach((func) => {
      const { name } = func;
      const article = /^[AEIOU]/u.test(name) ? "an" : "a";
      exports[name] = (value, options = {}) => {
        if (!ArrayBuffer.isView(value) || typedArrayNameGetter.call(value) !== name) {
          throw makeException(TypeError, `is not ${article} ${name} object`, options);
        }
        if (!options.allowShared && isSharedArrayBuffer(value.buffer)) {
          throw makeException(TypeError, "is a view on a SharedArrayBuffer, which is not allowed", options);
        }
        if (isArrayBufferDetached(value.buffer)) {
          throw makeException(TypeError, "is a view on a detached ArrayBuffer", options);
        }
        return value;
      };
    });
    exports.ArrayBufferView = (value, options = {}) => {
      if (!ArrayBuffer.isView(value)) {
        throw makeException(TypeError, "is not a view on an ArrayBuffer or SharedArrayBuffer", options);
      }
      if (!options.allowShared && isSharedArrayBuffer(value.buffer)) {
        throw makeException(TypeError, "is a view on a SharedArrayBuffer, which is not allowed", options);
      }
      if (isArrayBufferDetached(value.buffer)) {
        throw makeException(TypeError, "is a view on a detached ArrayBuffer", options);
      }
      return value;
    };
    exports.BufferSource = (value, options = {}) => {
      if (ArrayBuffer.isView(value)) {
        if (!options.allowShared && isSharedArrayBuffer(value.buffer)) {
          throw makeException(TypeError, "is a view on a SharedArrayBuffer, which is not allowed", options);
        }
        if (isArrayBufferDetached(value.buffer)) {
          throw makeException(TypeError, "is a view on a detached ArrayBuffer", options);
        }
        return value;
      }
      if (!options.allowShared && !isNonSharedArrayBuffer(value)) {
        throw makeException(TypeError, "is not an ArrayBuffer or a view on one", options);
      }
      if (options.allowShared && !isSharedArrayBuffer(value) && !isNonSharedArrayBuffer(value)) {
        throw makeException(TypeError, "is not an ArrayBuffer, SharedArrayBuffer, or a view on one", options);
      }
      if (isArrayBufferDetached(value)) {
        throw makeException(TypeError, "is a detached ArrayBuffer", options);
      }
      return value;
    };
    exports.DOMTimeStamp = exports["unsigned long long"];
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/utils.js
var require_utils = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/utils.js"(exports, module2) {
    "use strict";
    init_define_process();
    function isObject(value) {
      return typeof value === "object" && value !== null || typeof value === "function";
    }
    __name(isObject, "isObject");
    var hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);
    function define(target, source) {
      for (const key of Reflect.ownKeys(source)) {
        const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
        if (descriptor && !Reflect.defineProperty(target, key, descriptor)) {
          throw new TypeError(`Cannot redefine property: ${String(key)}`);
        }
      }
    }
    __name(define, "define");
    function newObjectInRealm(globalObject, object) {
      const ctorRegistry = initCtorRegistry(globalObject);
      return Object.defineProperties(Object.create(ctorRegistry["%Object.prototype%"]), Object.getOwnPropertyDescriptors(object));
    }
    __name(newObjectInRealm, "newObjectInRealm");
    var wrapperSymbol = Symbol("wrapper");
    var implSymbol = Symbol("impl");
    var sameObjectCaches = Symbol("SameObject caches");
    var ctorRegistrySymbol = Symbol.for("[webidl2js] constructor registry");
    var AsyncIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(async function* () {
    }).prototype);
    function initCtorRegistry(globalObject) {
      if (hasOwn(globalObject, ctorRegistrySymbol)) {
        return globalObject[ctorRegistrySymbol];
      }
      const ctorRegistry = /* @__PURE__ */ Object.create(null);
      ctorRegistry["%Object.prototype%"] = globalObject.Object.prototype;
      ctorRegistry["%IteratorPrototype%"] = Object.getPrototypeOf(Object.getPrototypeOf(new globalObject.Array()[Symbol.iterator]()));
      try {
        ctorRegistry["%AsyncIteratorPrototype%"] = Object.getPrototypeOf(Object.getPrototypeOf(globalObject.eval("(async function* () {})").prototype));
      } catch {
        ctorRegistry["%AsyncIteratorPrototype%"] = AsyncIteratorPrototype;
      }
      globalObject[ctorRegistrySymbol] = ctorRegistry;
      return ctorRegistry;
    }
    __name(initCtorRegistry, "initCtorRegistry");
    function getSameObject(wrapper, prop, creator) {
      if (!wrapper[sameObjectCaches]) {
        wrapper[sameObjectCaches] = /* @__PURE__ */ Object.create(null);
      }
      if (prop in wrapper[sameObjectCaches]) {
        return wrapper[sameObjectCaches][prop];
      }
      wrapper[sameObjectCaches][prop] = creator();
      return wrapper[sameObjectCaches][prop];
    }
    __name(getSameObject, "getSameObject");
    function wrapperForImpl(impl) {
      return impl ? impl[wrapperSymbol] : null;
    }
    __name(wrapperForImpl, "wrapperForImpl");
    function implForWrapper(wrapper) {
      return wrapper ? wrapper[implSymbol] : null;
    }
    __name(implForWrapper, "implForWrapper");
    function tryWrapperForImpl(impl) {
      const wrapper = wrapperForImpl(impl);
      return wrapper ? wrapper : impl;
    }
    __name(tryWrapperForImpl, "tryWrapperForImpl");
    function tryImplForWrapper(wrapper) {
      const impl = implForWrapper(wrapper);
      return impl ? impl : wrapper;
    }
    __name(tryImplForWrapper, "tryImplForWrapper");
    var iterInternalSymbol = Symbol("internal");
    function isArrayIndexPropName(P) {
      if (typeof P !== "string") {
        return false;
      }
      const i = P >>> 0;
      if (i === 2 ** 32 - 1) {
        return false;
      }
      const s = `${i}`;
      if (P !== s) {
        return false;
      }
      return true;
    }
    __name(isArrayIndexPropName, "isArrayIndexPropName");
    var byteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
    function isArrayBuffer(value) {
      try {
        byteLengthGetter.call(value);
        return true;
      } catch (e) {
        return false;
      }
    }
    __name(isArrayBuffer, "isArrayBuffer");
    function iteratorResult([key, value], kind) {
      let result;
      switch (kind) {
        case "key":
          result = key;
          break;
        case "value":
          result = value;
          break;
        case "key+value":
          result = [key, value];
          break;
      }
      return { value: result, done: false };
    }
    __name(iteratorResult, "iteratorResult");
    var supportsPropertyIndex = Symbol("supports property index");
    var supportedPropertyIndices = Symbol("supported property indices");
    var supportsPropertyName = Symbol("supports property name");
    var supportedPropertyNames = Symbol("supported property names");
    var indexedGet = Symbol("indexed property get");
    var indexedSetNew = Symbol("indexed property set new");
    var indexedSetExisting = Symbol("indexed property set existing");
    var namedGet = Symbol("named property get");
    var namedSetNew = Symbol("named property set new");
    var namedSetExisting = Symbol("named property set existing");
    var namedDelete = Symbol("named property delete");
    var asyncIteratorNext = Symbol("async iterator get the next iteration result");
    var asyncIteratorReturn = Symbol("async iterator return steps");
    var asyncIteratorInit = Symbol("async iterator initialization steps");
    var asyncIteratorEOI = Symbol("async iterator end of iteration");
    module2.exports = exports = {
      isObject,
      hasOwn,
      define,
      newObjectInRealm,
      wrapperSymbol,
      implSymbol,
      getSameObject,
      ctorRegistrySymbol,
      initCtorRegistry,
      wrapperForImpl,
      implForWrapper,
      tryWrapperForImpl,
      tryImplForWrapper,
      iterInternalSymbol,
      isArrayBuffer,
      isArrayIndexPropName,
      supportsPropertyIndex,
      supportedPropertyIndices,
      supportsPropertyName,
      supportedPropertyNames,
      indexedGet,
      indexedSetNew,
      indexedSetExisting,
      namedGet,
      namedSetNew,
      namedSetExisting,
      namedDelete,
      asyncIteratorNext,
      asyncIteratorReturn,
      asyncIteratorInit,
      asyncIteratorEOI,
      iteratorResult
    };
  }
});

// ../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/lib/regexes.js
var require_regexes = __commonJS({
  "../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/lib/regexes.js"(exports, module2) {
    "use strict";
    init_define_process();
    var combiningMarks = /[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0898-\u089F\u08CA-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u09FE\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B55-\u0B57\u0B62\u0B63\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C00-\u0C04\u0C3C\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0D00-\u0D03\u0D3B\u0D3C\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D81-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\u135D-\u135F\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u180F\u1885\u1886\u18A9\u1920-\u192B\u1930-\u193B\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F\u1AB0-\u1ACE\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF4\u1CF7-\u1CF9\u1DC0-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA82C\uA880\uA881\uA8B4-\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\u{101FD}\u{102E0}\u{10376}-\u{1037A}\u{10A01}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A0F}\u{10A38}-\u{10A3A}\u{10A3F}\u{10AE5}\u{10AE6}\u{10D24}-\u{10D27}\u{10EAB}\u{10EAC}\u{10F46}-\u{10F50}\u{10F82}-\u{10F85}\u{11000}-\u{11002}\u{11038}-\u{11046}\u{11070}\u{11073}\u{11074}\u{1107F}-\u{11082}\u{110B0}-\u{110BA}\u{110C2}\u{11100}-\u{11102}\u{11127}-\u{11134}\u{11145}\u{11146}\u{11173}\u{11180}-\u{11182}\u{111B3}-\u{111C0}\u{111C9}-\u{111CC}\u{111CE}\u{111CF}\u{1122C}-\u{11237}\u{1123E}\u{112DF}-\u{112EA}\u{11300}-\u{11303}\u{1133B}\u{1133C}\u{1133E}-\u{11344}\u{11347}\u{11348}\u{1134B}-\u{1134D}\u{11357}\u{11362}\u{11363}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11435}-\u{11446}\u{1145E}\u{114B0}-\u{114C3}\u{115AF}-\u{115B5}\u{115B8}-\u{115C0}\u{115DC}\u{115DD}\u{11630}-\u{11640}\u{116AB}-\u{116B7}\u{1171D}-\u{1172B}\u{1182C}-\u{1183A}\u{11930}-\u{11935}\u{11937}\u{11938}\u{1193B}-\u{1193E}\u{11940}\u{11942}\u{11943}\u{119D1}-\u{119D7}\u{119DA}-\u{119E0}\u{119E4}\u{11A01}-\u{11A0A}\u{11A33}-\u{11A39}\u{11A3B}-\u{11A3E}\u{11A47}\u{11A51}-\u{11A5B}\u{11A8A}-\u{11A99}\u{11C2F}-\u{11C36}\u{11C38}-\u{11C3F}\u{11C92}-\u{11CA7}\u{11CA9}-\u{11CB6}\u{11D31}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D45}\u{11D47}\u{11D8A}-\u{11D8E}\u{11D90}\u{11D91}\u{11D93}-\u{11D97}\u{11EF3}-\u{11EF6}\u{16AF0}-\u{16AF4}\u{16B30}-\u{16B36}\u{16F4F}\u{16F51}-\u{16F87}\u{16F8F}-\u{16F92}\u{16FE4}\u{16FF0}\u{16FF1}\u{1BC9D}\u{1BC9E}\u{1CF00}-\u{1CF2D}\u{1CF30}-\u{1CF46}\u{1D165}-\u{1D169}\u{1D16D}-\u{1D172}\u{1D17B}-\u{1D182}\u{1D185}-\u{1D18B}\u{1D1AA}-\u{1D1AD}\u{1D242}-\u{1D244}\u{1DA00}-\u{1DA36}\u{1DA3B}-\u{1DA6C}\u{1DA75}\u{1DA84}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E130}-\u{1E136}\u{1E2AE}\u{1E2EC}-\u{1E2EF}\u{1E8D0}-\u{1E8D6}\u{1E944}-\u{1E94A}\u{E0100}-\u{E01EF}]/u;
    var combiningClassVirama = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D3B\u0D3C\u0D4D\u0DCA\u0E3A\u0EBA\u0F84\u1039\u103A\u1714\u1734\u17D2\u1A60\u1B44\u1BAA\u1BAB\u1BF2\u1BF3\u2D7F\uA806\uA8C4\uA953\uA9C0\uAAF6\uABED\u{10A3F}\u{11046}\u{1107F}\u{110B9}\u{11133}\u{11134}\u{111C0}\u{11235}\u{112EA}\u{1134D}\u{11442}\u{114C2}\u{115BF}\u{1163F}\u{116B6}\u{1172B}\u{11839}\u{119E0}\u{11A34}\u{11A47}\u{11A99}\u{11C3F}\u{11D44}\u{11D45}\u{11D97}]/u;
    var validZWNJ = /[\u0620\u0626\u0628\u062A-\u062E\u0633-\u063F\u0641-\u0647\u0649\u064A\u066E\u066F\u0678-\u0687\u069A-\u06BF\u06C1\u06C2\u06CC\u06CE\u06D0\u06D1\u06FA-\u06FC\u06FF\u0712-\u0714\u071A-\u071D\u071F-\u0727\u0729\u072B\u072D\u072E\u074E-\u0758\u075C-\u076A\u076D-\u0770\u0772\u0775-\u0777\u077A-\u077F\u07CA-\u07EA\u0841-\u0845\u0848\u084A-\u0853\u0855\u0860\u0862-\u0865\u0868\u08A0-\u08A9\u08AF\u08B0\u08B3\u08B4\u08B6-\u08B8\u08BA-\u08BD\u1807\u1820-\u1878\u1887-\u18A8\u18AA\uA840-\uA872\u{10AC0}-\u{10AC4}\u{10ACD}\u{10AD3}-\u{10ADC}\u{10ADE}-\u{10AE0}\u{10AEB}-\u{10AEE}\u{10B80}\u{10B82}\u{10B86}-\u{10B88}\u{10B8A}\u{10B8B}\u{10B8D}\u{10B90}\u{10BAD}\u{10BAE}\u{10D00}-\u{10D21}\u{10D23}\u{10F30}-\u{10F32}\u{10F34}-\u{10F44}\u{10F51}-\u{10F53}\u{1E900}-\u{1E943}][\xAD\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u061C\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u070F\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08D3-\u08E1\u08E3-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u09FE\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C00\u0C04\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81\u0CBC\u0CBF\u0CC6\u0CCC\u0CCD\u0CE2\u0CE3\u0D00\u0D01\u0D3B\u0D3C\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4\u17B5\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u1885\u1886\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1A17\u1A18\u1A1B\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1AB0-\u1ABE\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BAB-\u1BAD\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1CF4\u1CF8\u1CF9\u1DC0-\u1DF9\u1DFB-\u1DFF\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302D\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA825\uA826\uA8C4\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uA9BD\uA9E5\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAA7C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEC\uAAED\uAAF6\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\uFEFF\uFFF9-\uFFFB\u{101FD}\u{102E0}\u{10376}-\u{1037A}\u{10A01}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A0F}\u{10A38}-\u{10A3A}\u{10A3F}\u{10AE5}\u{10AE6}\u{10D24}-\u{10D27}\u{10F46}-\u{10F50}\u{11001}\u{11038}-\u{11046}\u{1107F}-\u{11081}\u{110B3}-\u{110B6}\u{110B9}\u{110BA}\u{11100}-\u{11102}\u{11127}-\u{1112B}\u{1112D}-\u{11134}\u{11173}\u{11180}\u{11181}\u{111B6}-\u{111BE}\u{111C9}-\u{111CC}\u{1122F}-\u{11231}\u{11234}\u{11236}\u{11237}\u{1123E}\u{112DF}\u{112E3}-\u{112EA}\u{11300}\u{11301}\u{1133B}\u{1133C}\u{11340}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11438}-\u{1143F}\u{11442}-\u{11444}\u{11446}\u{1145E}\u{114B3}-\u{114B8}\u{114BA}\u{114BF}\u{114C0}\u{114C2}\u{114C3}\u{115B2}-\u{115B5}\u{115BC}\u{115BD}\u{115BF}\u{115C0}\u{115DC}\u{115DD}\u{11633}-\u{1163A}\u{1163D}\u{1163F}\u{11640}\u{116AB}\u{116AD}\u{116B0}-\u{116B5}\u{116B7}\u{1171D}-\u{1171F}\u{11722}-\u{11725}\u{11727}-\u{1172B}\u{1182F}-\u{11837}\u{11839}\u{1183A}\u{119D4}-\u{119D7}\u{119DA}\u{119DB}\u{119E0}\u{11A01}-\u{11A0A}\u{11A33}-\u{11A38}\u{11A3B}-\u{11A3E}\u{11A47}\u{11A51}-\u{11A56}\u{11A59}-\u{11A5B}\u{11A8A}-\u{11A96}\u{11A98}\u{11A99}\u{11C30}-\u{11C36}\u{11C38}-\u{11C3D}\u{11C3F}\u{11C92}-\u{11CA7}\u{11CAA}-\u{11CB0}\u{11CB2}\u{11CB3}\u{11CB5}\u{11CB6}\u{11D31}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D45}\u{11D47}\u{11D90}\u{11D91}\u{11D95}\u{11D97}\u{11EF3}\u{11EF4}\u{13430}-\u{13438}\u{16AF0}-\u{16AF4}\u{16B30}-\u{16B36}\u{16F4F}\u{16F8F}-\u{16F92}\u{1BC9D}\u{1BC9E}\u{1BCA0}-\u{1BCA3}\u{1D167}-\u{1D169}\u{1D173}-\u{1D182}\u{1D185}-\u{1D18B}\u{1D1AA}-\u{1D1AD}\u{1D242}-\u{1D244}\u{1DA00}-\u{1DA36}\u{1DA3B}-\u{1DA6C}\u{1DA75}\u{1DA84}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E130}-\u{1E136}\u{1E2EC}-\u{1E2EF}\u{1E8D0}-\u{1E8D6}\u{1E944}-\u{1E94B}\u{E0001}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}]*\u200C[\xAD\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u061C\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u070F\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08D3-\u08E1\u08E3-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u09FE\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C00\u0C04\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81\u0CBC\u0CBF\u0CC6\u0CCC\u0CCD\u0CE2\u0CE3\u0D00\u0D01\u0D3B\u0D3C\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4\u17B5\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u1885\u1886\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1A17\u1A18\u1A1B\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1AB0-\u1ABE\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BAB-\u1BAD\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1CF4\u1CF8\u1CF9\u1DC0-\u1DF9\u1DFB-\u1DFF\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302D\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA825\uA826\uA8C4\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uA9BD\uA9E5\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAA7C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEC\uAAED\uAAF6\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\uFEFF\uFFF9-\uFFFB\u{101FD}\u{102E0}\u{10376}-\u{1037A}\u{10A01}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A0F}\u{10A38}-\u{10A3A}\u{10A3F}\u{10AE5}\u{10AE6}\u{10D24}-\u{10D27}\u{10F46}-\u{10F50}\u{11001}\u{11038}-\u{11046}\u{1107F}-\u{11081}\u{110B3}-\u{110B6}\u{110B9}\u{110BA}\u{11100}-\u{11102}\u{11127}-\u{1112B}\u{1112D}-\u{11134}\u{11173}\u{11180}\u{11181}\u{111B6}-\u{111BE}\u{111C9}-\u{111CC}\u{1122F}-\u{11231}\u{11234}\u{11236}\u{11237}\u{1123E}\u{112DF}\u{112E3}-\u{112EA}\u{11300}\u{11301}\u{1133B}\u{1133C}\u{11340}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11438}-\u{1143F}\u{11442}-\u{11444}\u{11446}\u{1145E}\u{114B3}-\u{114B8}\u{114BA}\u{114BF}\u{114C0}\u{114C2}\u{114C3}\u{115B2}-\u{115B5}\u{115BC}\u{115BD}\u{115BF}\u{115C0}\u{115DC}\u{115DD}\u{11633}-\u{1163A}\u{1163D}\u{1163F}\u{11640}\u{116AB}\u{116AD}\u{116B0}-\u{116B5}\u{116B7}\u{1171D}-\u{1171F}\u{11722}-\u{11725}\u{11727}-\u{1172B}\u{1182F}-\u{11837}\u{11839}\u{1183A}\u{119D4}-\u{119D7}\u{119DA}\u{119DB}\u{119E0}\u{11A01}-\u{11A0A}\u{11A33}-\u{11A38}\u{11A3B}-\u{11A3E}\u{11A47}\u{11A51}-\u{11A56}\u{11A59}-\u{11A5B}\u{11A8A}-\u{11A96}\u{11A98}\u{11A99}\u{11C30}-\u{11C36}\u{11C38}-\u{11C3D}\u{11C3F}\u{11C92}-\u{11CA7}\u{11CAA}-\u{11CB0}\u{11CB2}\u{11CB3}\u{11CB5}\u{11CB6}\u{11D31}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D45}\u{11D47}\u{11D90}\u{11D91}\u{11D95}\u{11D97}\u{11EF3}\u{11EF4}\u{13430}-\u{13438}\u{16AF0}-\u{16AF4}\u{16B30}-\u{16B36}\u{16F4F}\u{16F8F}-\u{16F92}\u{1BC9D}\u{1BC9E}\u{1BCA0}-\u{1BCA3}\u{1D167}-\u{1D169}\u{1D173}-\u{1D182}\u{1D185}-\u{1D18B}\u{1D1AA}-\u{1D1AD}\u{1D242}-\u{1D244}\u{1DA00}-\u{1DA36}\u{1DA3B}-\u{1DA6C}\u{1DA75}\u{1DA84}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E130}-\u{1E136}\u{1E2EC}-\u{1E2EF}\u{1E8D0}-\u{1E8D6}\u{1E944}-\u{1E94B}\u{E0001}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}]*[\u0620\u0622-\u063F\u0641-\u064A\u066E\u066F\u0671-\u0673\u0675-\u06D3\u06D5\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u077F\u07CA-\u07EA\u0840-\u0855\u0860\u0862-\u0865\u0867-\u086A\u08A0-\u08AC\u08AE-\u08B4\u08B6-\u08BD\u1807\u1820-\u1878\u1887-\u18A8\u18AA\uA840-\uA871\u{10AC0}-\u{10AC5}\u{10AC7}\u{10AC9}\u{10ACA}\u{10ACE}-\u{10AD6}\u{10AD8}-\u{10AE1}\u{10AE4}\u{10AEB}-\u{10AEF}\u{10B80}-\u{10B91}\u{10BA9}-\u{10BAE}\u{10D01}-\u{10D23}\u{10F30}-\u{10F44}\u{10F51}-\u{10F54}\u{1E900}-\u{1E943}]/u;
    var bidiDomain = /[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05EA\u05EF-\u05F4\u0600-\u0605\u0608\u060B\u060D\u061B-\u064A\u0660-\u0669\u066B-\u066F\u0671-\u06D5\u06DD\u06E5\u06E6\u06EE\u06EF\u06FA-\u070D\u070F\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u083E\u0840-\u0858\u085E\u0860-\u086A\u0870-\u088E\u0890\u0891\u08A0-\u08C9\u08E2\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBC2\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFC\uFE70-\uFE74\uFE76-\uFEFC\u{10800}-\u{10805}\u{10808}\u{1080A}-\u{10835}\u{10837}\u{10838}\u{1083C}\u{1083F}-\u{10855}\u{10857}-\u{1089E}\u{108A7}-\u{108AF}\u{108E0}-\u{108F2}\u{108F4}\u{108F5}\u{108FB}-\u{1091B}\u{10920}-\u{10939}\u{1093F}\u{10980}-\u{109B7}\u{109BC}-\u{109CF}\u{109D2}-\u{10A00}\u{10A10}-\u{10A13}\u{10A15}-\u{10A17}\u{10A19}-\u{10A35}\u{10A40}-\u{10A48}\u{10A50}-\u{10A58}\u{10A60}-\u{10A9F}\u{10AC0}-\u{10AE4}\u{10AEB}-\u{10AF6}\u{10B00}-\u{10B35}\u{10B40}-\u{10B55}\u{10B58}-\u{10B72}\u{10B78}-\u{10B91}\u{10B99}-\u{10B9C}\u{10BA9}-\u{10BAF}\u{10C00}-\u{10C48}\u{10C80}-\u{10CB2}\u{10CC0}-\u{10CF2}\u{10CFA}-\u{10D23}\u{10D30}-\u{10D39}\u{10E60}-\u{10E7E}\u{10E80}-\u{10EA9}\u{10EAD}\u{10EB0}\u{10EB1}\u{10F00}-\u{10F27}\u{10F30}-\u{10F45}\u{10F51}-\u{10F59}\u{10F70}-\u{10F81}\u{10F86}-\u{10F89}\u{10FB0}-\u{10FCB}\u{10FE0}-\u{10FF6}\u{1E800}-\u{1E8C4}\u{1E8C7}-\u{1E8CF}\u{1E900}-\u{1E943}\u{1E94B}\u{1E950}-\u{1E959}\u{1E95E}\u{1E95F}\u{1EC71}-\u{1ECB4}\u{1ED01}-\u{1ED3D}\u{1EE00}-\u{1EE03}\u{1EE05}-\u{1EE1F}\u{1EE21}\u{1EE22}\u{1EE24}\u{1EE27}\u{1EE29}-\u{1EE32}\u{1EE34}-\u{1EE37}\u{1EE39}\u{1EE3B}\u{1EE42}\u{1EE47}\u{1EE49}\u{1EE4B}\u{1EE4D}-\u{1EE4F}\u{1EE51}\u{1EE52}\u{1EE54}\u{1EE57}\u{1EE59}\u{1EE5B}\u{1EE5D}\u{1EE5F}\u{1EE61}\u{1EE62}\u{1EE64}\u{1EE67}-\u{1EE6A}\u{1EE6C}-\u{1EE72}\u{1EE74}-\u{1EE77}\u{1EE79}-\u{1EE7C}\u{1EE7E}\u{1EE80}-\u{1EE89}\u{1EE8B}-\u{1EE9B}\u{1EEA1}-\u{1EEA3}\u{1EEA5}-\u{1EEA9}\u{1EEAB}-\u{1EEBB}]/u;
    var bidiS1LTR = /[A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02B8\u02BB-\u02C1\u02D0\u02D1\u02E0-\u02E4\u02EE\u0370-\u0373\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0482\u048A-\u052F\u0531-\u0556\u0559-\u0589\u0903-\u0939\u093B\u093D-\u0940\u0949-\u094C\u094E-\u0950\u0958-\u0961\u0964-\u0980\u0982\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD-\u09C0\u09C7\u09C8\u09CB\u09CC\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E1\u09E6-\u09F1\u09F4-\u09FA\u09FC\u09FD\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3E-\u0A40\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A76\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD-\u0AC0\u0AC9\u0ACB\u0ACC\u0AD0\u0AE0\u0AE1\u0AE6-\u0AF0\u0AF9\u0B02\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B3E\u0B40\u0B47\u0B48\u0B4B\u0B4C\u0B57\u0B5C\u0B5D\u0B5F-\u0B61\u0B66-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE\u0BBF\u0BC1\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCC\u0BD0\u0BD7\u0BE6-\u0BF2\u0C01-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C41-\u0C44\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C66-\u0C6F\u0C77\u0C7F\u0C80\u0C82-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD-\u0CC4\u0CC6-\u0CC8\u0CCA\u0CCB\u0CD5\u0CD6\u0CDD\u0CDE\u0CE0\u0CE1\u0CE6-\u0CEF\u0CF1\u0CF2\u0D02-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D40\u0D46-\u0D48\u0D4A-\u0D4C\u0D4E\u0D4F\u0D54-\u0D61\u0D66-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCF-\u0DD1\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2-\u0DF4\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E4F-\u0E5B\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00-\u0F17\u0F1A-\u0F34\u0F36\u0F38\u0F3E-\u0F47\u0F49-\u0F6C\u0F7F\u0F85\u0F88-\u0F8C\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE-\u0FDA\u1000-\u102C\u1031\u1038\u103B\u103C\u103F-\u1057\u105A-\u105D\u1061-\u1070\u1075-\u1081\u1083\u1084\u1087-\u108C\u108E-\u109C\u109E-\u10C5\u10C7\u10CD\u10D0-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1360-\u137C\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u167F\u1681-\u169A\u16A0-\u16F8\u1700-\u1711\u1715\u171F-\u1731\u1734-\u1736\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17B6\u17BE-\u17C5\u17C7\u17C8\u17D4-\u17DA\u17DC\u17E0-\u17E9\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1923-\u1926\u1929-\u192B\u1930\u1931\u1933-\u1938\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A16\u1A19\u1A1A\u1A1E-\u1A55\u1A57\u1A61\u1A63\u1A64\u1A6D-\u1A72\u1A80-\u1A89\u1A90-\u1A99\u1AA0-\u1AAD\u1B04-\u1B33\u1B35\u1B3B\u1B3D-\u1B41\u1B43-\u1B4C\u1B50-\u1B6A\u1B74-\u1B7E\u1B82-\u1BA1\u1BA6\u1BA7\u1BAA\u1BAE-\u1BE5\u1BE7\u1BEA-\u1BEC\u1BEE\u1BF2\u1BF3\u1BFC-\u1C2B\u1C34\u1C35\u1C3B-\u1C49\u1C4D-\u1C88\u1C90-\u1CBA\u1CBD-\u1CC7\u1CD3\u1CE1\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5-\u1CF7\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200E\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u214F\u2160-\u2188\u2336-\u237A\u2395\u249C-\u24E9\u26AC\u2800-\u28FF\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D70\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u302E\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3190-\u31BF\u31F0-\u321C\u3220-\u324F\u3260-\u327B\u327F-\u32B0\u32C0-\u32CB\u32D0-\u3376\u337B-\u33DD\u33E0-\u33FE\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA60C\uA610-\uA62B\uA640-\uA66E\uA680-\uA69D\uA6A0-\uA6EF\uA6F2-\uA6F7\uA722-\uA787\uA789-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA824\uA827\uA830-\uA837\uA840-\uA873\uA880-\uA8C3\uA8CE-\uA8D9\uA8F2-\uA8FE\uA900-\uA925\uA92E-\uA946\uA952\uA953\uA95F-\uA97C\uA983-\uA9B2\uA9B4\uA9B5\uA9BA\uA9BB\uA9BE-\uA9CD\uA9CF-\uA9D9\uA9DE-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA2F\uAA30\uAA33\uAA34\uAA40-\uAA42\uAA44-\uAA4B\uAA4D\uAA50-\uAA59\uAA5C-\uAA7B\uAA7D-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAAEB\uAAEE-\uAAF5\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB69\uAB70-\uABE4\uABE6\uABE7\uABE9-\uABEC\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uD800-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\u{10000}-\u{1000B}\u{1000D}-\u{10026}\u{10028}-\u{1003A}\u{1003C}\u{1003D}\u{1003F}-\u{1004D}\u{10050}-\u{1005D}\u{10080}-\u{100FA}\u{10100}\u{10102}\u{10107}-\u{10133}\u{10137}-\u{1013F}\u{1018D}\u{1018E}\u{101D0}-\u{101FC}\u{10280}-\u{1029C}\u{102A0}-\u{102D0}\u{10300}-\u{10323}\u{1032D}-\u{1034A}\u{10350}-\u{10375}\u{10380}-\u{1039D}\u{1039F}-\u{103C3}\u{103C8}-\u{103D5}\u{10400}-\u{1049D}\u{104A0}-\u{104A9}\u{104B0}-\u{104D3}\u{104D8}-\u{104FB}\u{10500}-\u{10527}\u{10530}-\u{10563}\u{1056F}-\u{1057A}\u{1057C}-\u{1058A}\u{1058C}-\u{10592}\u{10594}\u{10595}\u{10597}-\u{105A1}\u{105A3}-\u{105B1}\u{105B3}-\u{105B9}\u{105BB}\u{105BC}\u{10600}-\u{10736}\u{10740}-\u{10755}\u{10760}-\u{10767}\u{10780}-\u{10785}\u{10787}-\u{107B0}\u{107B2}-\u{107BA}\u{11000}\u{11002}-\u{11037}\u{11047}-\u{1104D}\u{11066}-\u{1106F}\u{11071}\u{11072}\u{11075}\u{11082}-\u{110B2}\u{110B7}\u{110B8}\u{110BB}-\u{110C1}\u{110CD}\u{110D0}-\u{110E8}\u{110F0}-\u{110F9}\u{11103}-\u{11126}\u{1112C}\u{11136}-\u{11147}\u{11150}-\u{11172}\u{11174}-\u{11176}\u{11182}-\u{111B5}\u{111BF}-\u{111C8}\u{111CD}\u{111CE}\u{111D0}-\u{111DF}\u{111E1}-\u{111F4}\u{11200}-\u{11211}\u{11213}-\u{1122E}\u{11232}\u{11233}\u{11235}\u{11238}-\u{1123D}\u{11280}-\u{11286}\u{11288}\u{1128A}-\u{1128D}\u{1128F}-\u{1129D}\u{1129F}-\u{112A9}\u{112B0}-\u{112DE}\u{112E0}-\u{112E2}\u{112F0}-\u{112F9}\u{11302}\u{11303}\u{11305}-\u{1130C}\u{1130F}\u{11310}\u{11313}-\u{11328}\u{1132A}-\u{11330}\u{11332}\u{11333}\u{11335}-\u{11339}\u{1133D}-\u{1133F}\u{11341}-\u{11344}\u{11347}\u{11348}\u{1134B}-\u{1134D}\u{11350}\u{11357}\u{1135D}-\u{11363}\u{11400}-\u{11437}\u{11440}\u{11441}\u{11445}\u{11447}-\u{1145B}\u{1145D}\u{1145F}-\u{11461}\u{11480}-\u{114B2}\u{114B9}\u{114BB}-\u{114BE}\u{114C1}\u{114C4}-\u{114C7}\u{114D0}-\u{114D9}\u{11580}-\u{115B1}\u{115B8}-\u{115BB}\u{115BE}\u{115C1}-\u{115DB}\u{11600}-\u{11632}\u{1163B}\u{1163C}\u{1163E}\u{11641}-\u{11644}\u{11650}-\u{11659}\u{11680}-\u{116AA}\u{116AC}\u{116AE}\u{116AF}\u{116B6}\u{116B8}\u{116B9}\u{116C0}-\u{116C9}\u{11700}-\u{1171A}\u{11720}\u{11721}\u{11726}\u{11730}-\u{11746}\u{11800}-\u{1182E}\u{11838}\u{1183B}\u{118A0}-\u{118F2}\u{118FF}-\u{11906}\u{11909}\u{1190C}-\u{11913}\u{11915}\u{11916}\u{11918}-\u{11935}\u{11937}\u{11938}\u{1193D}\u{1193F}-\u{11942}\u{11944}-\u{11946}\u{11950}-\u{11959}\u{119A0}-\u{119A7}\u{119AA}-\u{119D3}\u{119DC}-\u{119DF}\u{119E1}-\u{119E4}\u{11A00}\u{11A07}\u{11A08}\u{11A0B}-\u{11A32}\u{11A39}\u{11A3A}\u{11A3F}-\u{11A46}\u{11A50}\u{11A57}\u{11A58}\u{11A5C}-\u{11A89}\u{11A97}\u{11A9A}-\u{11AA2}\u{11AB0}-\u{11AF8}\u{11C00}-\u{11C08}\u{11C0A}-\u{11C2F}\u{11C3E}-\u{11C45}\u{11C50}-\u{11C6C}\u{11C70}-\u{11C8F}\u{11CA9}\u{11CB1}\u{11CB4}\u{11D00}-\u{11D06}\u{11D08}\u{11D09}\u{11D0B}-\u{11D30}\u{11D46}\u{11D50}-\u{11D59}\u{11D60}-\u{11D65}\u{11D67}\u{11D68}\u{11D6A}-\u{11D8E}\u{11D93}\u{11D94}\u{11D96}\u{11D98}\u{11DA0}-\u{11DA9}\u{11EE0}-\u{11EF2}\u{11EF5}-\u{11EF8}\u{11FB0}\u{11FC0}-\u{11FD4}\u{11FFF}-\u{12399}\u{12400}-\u{1246E}\u{12470}-\u{12474}\u{12480}-\u{12543}\u{12F90}-\u{12FF2}\u{13000}-\u{1342E}\u{13430}-\u{13438}\u{14400}-\u{14646}\u{16800}-\u{16A38}\u{16A40}-\u{16A5E}\u{16A60}-\u{16A69}\u{16A6E}-\u{16ABE}\u{16AC0}-\u{16AC9}\u{16AD0}-\u{16AED}\u{16AF5}\u{16B00}-\u{16B2F}\u{16B37}-\u{16B45}\u{16B50}-\u{16B59}\u{16B5B}-\u{16B61}\u{16B63}-\u{16B77}\u{16B7D}-\u{16B8F}\u{16E40}-\u{16E9A}\u{16F00}-\u{16F4A}\u{16F50}-\u{16F87}\u{16F93}-\u{16F9F}\u{16FE0}\u{16FE1}\u{16FE3}\u{16FF0}\u{16FF1}\u{17000}-\u{187F7}\u{18800}-\u{18CD5}\u{18D00}-\u{18D08}\u{1AFF0}-\u{1AFF3}\u{1AFF5}-\u{1AFFB}\u{1AFFD}\u{1AFFE}\u{1B000}-\u{1B122}\u{1B150}-\u{1B152}\u{1B164}-\u{1B167}\u{1B170}-\u{1B2FB}\u{1BC00}-\u{1BC6A}\u{1BC70}-\u{1BC7C}\u{1BC80}-\u{1BC88}\u{1BC90}-\u{1BC99}\u{1BC9C}\u{1BC9F}\u{1CF50}-\u{1CFC3}\u{1D000}-\u{1D0F5}\u{1D100}-\u{1D126}\u{1D129}-\u{1D166}\u{1D16A}-\u{1D172}\u{1D183}\u{1D184}\u{1D18C}-\u{1D1A9}\u{1D1AE}-\u{1D1E8}\u{1D2E0}-\u{1D2F3}\u{1D360}-\u{1D378}\u{1D400}-\u{1D454}\u{1D456}-\u{1D49C}\u{1D49E}\u{1D49F}\u{1D4A2}\u{1D4A5}\u{1D4A6}\u{1D4A9}-\u{1D4AC}\u{1D4AE}-\u{1D4B9}\u{1D4BB}\u{1D4BD}-\u{1D4C3}\u{1D4C5}-\u{1D505}\u{1D507}-\u{1D50A}\u{1D50D}-\u{1D514}\u{1D516}-\u{1D51C}\u{1D51E}-\u{1D539}\u{1D53B}-\u{1D53E}\u{1D540}-\u{1D544}\u{1D546}\u{1D54A}-\u{1D550}\u{1D552}-\u{1D6A5}\u{1D6A8}-\u{1D6DA}\u{1D6DC}-\u{1D714}\u{1D716}-\u{1D74E}\u{1D750}-\u{1D788}\u{1D78A}-\u{1D7C2}\u{1D7C4}-\u{1D7CB}\u{1D800}-\u{1D9FF}\u{1DA37}-\u{1DA3A}\u{1DA6D}-\u{1DA74}\u{1DA76}-\u{1DA83}\u{1DA85}-\u{1DA8B}\u{1DF00}-\u{1DF1E}\u{1E100}-\u{1E12C}\u{1E137}-\u{1E13D}\u{1E140}-\u{1E149}\u{1E14E}\u{1E14F}\u{1E290}-\u{1E2AD}\u{1E2C0}-\u{1E2EB}\u{1E2F0}-\u{1E2F9}\u{1E7E0}-\u{1E7E6}\u{1E7E8}-\u{1E7EB}\u{1E7ED}\u{1E7EE}\u{1E7F0}-\u{1E7FE}\u{1F110}-\u{1F12E}\u{1F130}-\u{1F169}\u{1F170}-\u{1F1AC}\u{1F1E6}-\u{1F202}\u{1F210}-\u{1F23B}\u{1F240}-\u{1F248}\u{1F250}\u{1F251}\u{20000}-\u{2A6DF}\u{2A700}-\u{2B738}\u{2B740}-\u{2B81D}\u{2B820}-\u{2CEA1}\u{2CEB0}-\u{2EBE0}\u{2F800}-\u{2FA1D}\u{30000}-\u{3134A}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;
    var bidiS1RTL = /[\u05BE\u05C0\u05C3\u05C6\u05D0-\u05EA\u05EF-\u05F4\u0608\u060B\u060D\u061B-\u064A\u066D-\u066F\u0671-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u070D\u070F\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u083E\u0840-\u0858\u085E\u0860-\u086A\u0870-\u088E\u08A0-\u08C9\u200F\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBC2\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFC\uFE70-\uFE74\uFE76-\uFEFC\u{10800}-\u{10805}\u{10808}\u{1080A}-\u{10835}\u{10837}\u{10838}\u{1083C}\u{1083F}-\u{10855}\u{10857}-\u{1089E}\u{108A7}-\u{108AF}\u{108E0}-\u{108F2}\u{108F4}\u{108F5}\u{108FB}-\u{1091B}\u{10920}-\u{10939}\u{1093F}\u{10980}-\u{109B7}\u{109BC}-\u{109CF}\u{109D2}-\u{10A00}\u{10A10}-\u{10A13}\u{10A15}-\u{10A17}\u{10A19}-\u{10A35}\u{10A40}-\u{10A48}\u{10A50}-\u{10A58}\u{10A60}-\u{10A9F}\u{10AC0}-\u{10AE4}\u{10AEB}-\u{10AF6}\u{10B00}-\u{10B35}\u{10B40}-\u{10B55}\u{10B58}-\u{10B72}\u{10B78}-\u{10B91}\u{10B99}-\u{10B9C}\u{10BA9}-\u{10BAF}\u{10C00}-\u{10C48}\u{10C80}-\u{10CB2}\u{10CC0}-\u{10CF2}\u{10CFA}-\u{10D23}\u{10E80}-\u{10EA9}\u{10EAD}\u{10EB0}\u{10EB1}\u{10F00}-\u{10F27}\u{10F30}-\u{10F45}\u{10F51}-\u{10F59}\u{10F70}-\u{10F81}\u{10F86}-\u{10F89}\u{10FB0}-\u{10FCB}\u{10FE0}-\u{10FF6}\u{1E800}-\u{1E8C4}\u{1E8C7}-\u{1E8CF}\u{1E900}-\u{1E943}\u{1E94B}\u{1E950}-\u{1E959}\u{1E95E}\u{1E95F}\u{1EC71}-\u{1ECB4}\u{1ED01}-\u{1ED3D}\u{1EE00}-\u{1EE03}\u{1EE05}-\u{1EE1F}\u{1EE21}\u{1EE22}\u{1EE24}\u{1EE27}\u{1EE29}-\u{1EE32}\u{1EE34}-\u{1EE37}\u{1EE39}\u{1EE3B}\u{1EE42}\u{1EE47}\u{1EE49}\u{1EE4B}\u{1EE4D}-\u{1EE4F}\u{1EE51}\u{1EE52}\u{1EE54}\u{1EE57}\u{1EE59}\u{1EE5B}\u{1EE5D}\u{1EE5F}\u{1EE61}\u{1EE62}\u{1EE64}\u{1EE67}-\u{1EE6A}\u{1EE6C}-\u{1EE72}\u{1EE74}-\u{1EE77}\u{1EE79}-\u{1EE7C}\u{1EE7E}\u{1EE80}-\u{1EE89}\u{1EE8B}-\u{1EE9B}\u{1EEA1}-\u{1EEA3}\u{1EEA5}-\u{1EEA9}\u{1EEAB}-\u{1EEBB}]/u;
    var bidiS2 = /^[\0-\x08\x0E-\x1B!-@\[-`\{-\x84\x86-\xA9\xAB-\xB4\xB6-\xB9\xBB-\xBF\xD7\xF7\u02B9\u02BA\u02C2-\u02CF\u02D2-\u02DF\u02E5-\u02ED\u02EF-\u036F\u0374\u0375\u037E\u0384\u0385\u0387\u03F6\u0483-\u0489\u058A\u058D-\u058F\u0591-\u05C7\u05D0-\u05EA\u05EF-\u05F4\u0600-\u070D\u070F-\u074A\u074D-\u07B1\u07C0-\u07FA\u07FD-\u082D\u0830-\u083E\u0840-\u085B\u085E\u0860-\u086A\u0870-\u088E\u0890\u0891\u0898-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u09F2\u09F3\u09FB\u09FE\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0AF1\u0AFA-\u0AFF\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B55\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0BF3-\u0BFA\u0C00\u0C04\u0C3C\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C78-\u0C7E\u0C81\u0CBC\u0CCC\u0CCD\u0CE2\u0CE3\u0D00\u0D01\u0D3B\u0D3C\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0D81\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E3F\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39-\u0F3D\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1390-\u1399\u1400\u169B\u169C\u1712-\u1714\u1732\u1733\u1752\u1753\u1772\u1773\u17B4\u17B5\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DB\u17DD\u17F0-\u17F9\u1800-\u180F\u1885\u1886\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1940\u1944\u1945\u19DE-\u19FF\u1A17\u1A18\u1A1B\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1AB0-\u1ACE\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BAB-\u1BAD\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1CF4\u1CF8\u1CF9\u1DC0-\u1DFF\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u200B-\u200D\u200F-\u2027\u202F-\u205E\u2060-\u2064\u206A-\u2070\u2074-\u207E\u2080-\u208E\u20A0-\u20C0\u20D0-\u20F0\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u2150-\u215F\u2189-\u218B\u2190-\u2335\u237B-\u2394\u2396-\u2426\u2440-\u244A\u2460-\u249B\u24EA-\u26AB\u26AD-\u27FF\u2900-\u2B73\u2B76-\u2B95\u2B97-\u2BFF\u2CE5-\u2CEA\u2CEF-\u2CF1\u2CF9-\u2CFF\u2D7F\u2DE0-\u2E5D\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFB\u3001-\u3004\u3008-\u3020\u302A-\u302D\u3030\u3036\u3037\u303D-\u303F\u3099-\u309C\u30A0\u30FB\u31C0-\u31E3\u321D\u321E\u3250-\u325F\u327C-\u327E\u32B1-\u32BF\u32CC-\u32CF\u3377-\u337A\u33DE\u33DF\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA60D-\uA60F\uA66F-\uA67F\uA69E\uA69F\uA6F0\uA6F1\uA700-\uA721\uA788\uA802\uA806\uA80B\uA825\uA826\uA828-\uA82C\uA838\uA839\uA874-\uA877\uA8C4\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uA9BD\uA9E5\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAA7C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEC\uAAED\uAAF6\uAB6A\uAB6B\uABE5\uABE8\uABED\uFB1D-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBC2\uFBD3-\uFD8F\uFD92-\uFDC7\uFDCF\uFDF0-\uFE19\uFE20-\uFE52\uFE54-\uFE66\uFE68-\uFE6B\uFE70-\uFE74\uFE76-\uFEFC\uFEFF\uFF01-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFF9-\uFFFD\u{10101}\u{10140}-\u{1018C}\u{10190}-\u{1019C}\u{101A0}\u{101FD}\u{102E0}-\u{102FB}\u{10376}-\u{1037A}\u{10800}-\u{10805}\u{10808}\u{1080A}-\u{10835}\u{10837}\u{10838}\u{1083C}\u{1083F}-\u{10855}\u{10857}-\u{1089E}\u{108A7}-\u{108AF}\u{108E0}-\u{108F2}\u{108F4}\u{108F5}\u{108FB}-\u{1091B}\u{1091F}-\u{10939}\u{1093F}\u{10980}-\u{109B7}\u{109BC}-\u{109CF}\u{109D2}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A13}\u{10A15}-\u{10A17}\u{10A19}-\u{10A35}\u{10A38}-\u{10A3A}\u{10A3F}-\u{10A48}\u{10A50}-\u{10A58}\u{10A60}-\u{10A9F}\u{10AC0}-\u{10AE6}\u{10AEB}-\u{10AF6}\u{10B00}-\u{10B35}\u{10B39}-\u{10B55}\u{10B58}-\u{10B72}\u{10B78}-\u{10B91}\u{10B99}-\u{10B9C}\u{10BA9}-\u{10BAF}\u{10C00}-\u{10C48}\u{10C80}-\u{10CB2}\u{10CC0}-\u{10CF2}\u{10CFA}-\u{10D27}\u{10D30}-\u{10D39}\u{10E60}-\u{10E7E}\u{10E80}-\u{10EA9}\u{10EAB}-\u{10EAD}\u{10EB0}\u{10EB1}\u{10F00}-\u{10F27}\u{10F30}-\u{10F59}\u{10F70}-\u{10F89}\u{10FB0}-\u{10FCB}\u{10FE0}-\u{10FF6}\u{11001}\u{11038}-\u{11046}\u{11052}-\u{11065}\u{11070}\u{11073}\u{11074}\u{1107F}-\u{11081}\u{110B3}-\u{110B6}\u{110B9}\u{110BA}\u{110C2}\u{11100}-\u{11102}\u{11127}-\u{1112B}\u{1112D}-\u{11134}\u{11173}\u{11180}\u{11181}\u{111B6}-\u{111BE}\u{111C9}-\u{111CC}\u{111CF}\u{1122F}-\u{11231}\u{11234}\u{11236}\u{11237}\u{1123E}\u{112DF}\u{112E3}-\u{112EA}\u{11300}\u{11301}\u{1133B}\u{1133C}\u{11340}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11438}-\u{1143F}\u{11442}-\u{11444}\u{11446}\u{1145E}\u{114B3}-\u{114B8}\u{114BA}\u{114BF}\u{114C0}\u{114C2}\u{114C3}\u{115B2}-\u{115B5}\u{115BC}\u{115BD}\u{115BF}\u{115C0}\u{115DC}\u{115DD}\u{11633}-\u{1163A}\u{1163D}\u{1163F}\u{11640}\u{11660}-\u{1166C}\u{116AB}\u{116AD}\u{116B0}-\u{116B5}\u{116B7}\u{1171D}-\u{1171F}\u{11722}-\u{11725}\u{11727}-\u{1172B}\u{1182F}-\u{11837}\u{11839}\u{1183A}\u{1193B}\u{1193C}\u{1193E}\u{11943}\u{119D4}-\u{119D7}\u{119DA}\u{119DB}\u{119E0}\u{11A01}-\u{11A06}\u{11A09}\u{11A0A}\u{11A33}-\u{11A38}\u{11A3B}-\u{11A3E}\u{11A47}\u{11A51}-\u{11A56}\u{11A59}-\u{11A5B}\u{11A8A}-\u{11A96}\u{11A98}\u{11A99}\u{11C30}-\u{11C36}\u{11C38}-\u{11C3D}\u{11C92}-\u{11CA7}\u{11CAA}-\u{11CB0}\u{11CB2}\u{11CB3}\u{11CB5}\u{11CB6}\u{11D31}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D45}\u{11D47}\u{11D90}\u{11D91}\u{11D95}\u{11D97}\u{11EF3}\u{11EF4}\u{11FD5}-\u{11FF1}\u{16AF0}-\u{16AF4}\u{16B30}-\u{16B36}\u{16F4F}\u{16F8F}-\u{16F92}\u{16FE2}\u{16FE4}\u{1BC9D}\u{1BC9E}\u{1BCA0}-\u{1BCA3}\u{1CF00}-\u{1CF2D}\u{1CF30}-\u{1CF46}\u{1D167}-\u{1D169}\u{1D173}-\u{1D182}\u{1D185}-\u{1D18B}\u{1D1AA}-\u{1D1AD}\u{1D1E9}\u{1D1EA}\u{1D200}-\u{1D245}\u{1D300}-\u{1D356}\u{1D6DB}\u{1D715}\u{1D74F}\u{1D789}\u{1D7C3}\u{1D7CE}-\u{1D7FF}\u{1DA00}-\u{1DA36}\u{1DA3B}-\u{1DA6C}\u{1DA75}\u{1DA84}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E130}-\u{1E136}\u{1E2AE}\u{1E2EC}-\u{1E2EF}\u{1E2FF}\u{1E800}-\u{1E8C4}\u{1E8C7}-\u{1E8D6}\u{1E900}-\u{1E94B}\u{1E950}-\u{1E959}\u{1E95E}\u{1E95F}\u{1EC71}-\u{1ECB4}\u{1ED01}-\u{1ED3D}\u{1EE00}-\u{1EE03}\u{1EE05}-\u{1EE1F}\u{1EE21}\u{1EE22}\u{1EE24}\u{1EE27}\u{1EE29}-\u{1EE32}\u{1EE34}-\u{1EE37}\u{1EE39}\u{1EE3B}\u{1EE42}\u{1EE47}\u{1EE49}\u{1EE4B}\u{1EE4D}-\u{1EE4F}\u{1EE51}\u{1EE52}\u{1EE54}\u{1EE57}\u{1EE59}\u{1EE5B}\u{1EE5D}\u{1EE5F}\u{1EE61}\u{1EE62}\u{1EE64}\u{1EE67}-\u{1EE6A}\u{1EE6C}-\u{1EE72}\u{1EE74}-\u{1EE77}\u{1EE79}-\u{1EE7C}\u{1EE7E}\u{1EE80}-\u{1EE89}\u{1EE8B}-\u{1EE9B}\u{1EEA1}-\u{1EEA3}\u{1EEA5}-\u{1EEA9}\u{1EEAB}-\u{1EEBB}\u{1EEF0}\u{1EEF1}\u{1F000}-\u{1F02B}\u{1F030}-\u{1F093}\u{1F0A0}-\u{1F0AE}\u{1F0B1}-\u{1F0BF}\u{1F0C1}-\u{1F0CF}\u{1F0D1}-\u{1F0F5}\u{1F100}-\u{1F10F}\u{1F12F}\u{1F16A}-\u{1F16F}\u{1F1AD}\u{1F260}-\u{1F265}\u{1F300}-\u{1F6D7}\u{1F6DD}-\u{1F6EC}\u{1F6F0}-\u{1F6FC}\u{1F700}-\u{1F773}\u{1F780}-\u{1F7D8}\u{1F7E0}-\u{1F7EB}\u{1F7F0}\u{1F800}-\u{1F80B}\u{1F810}-\u{1F847}\u{1F850}-\u{1F859}\u{1F860}-\u{1F887}\u{1F890}-\u{1F8AD}\u{1F8B0}\u{1F8B1}\u{1F900}-\u{1FA53}\u{1FA60}-\u{1FA6D}\u{1FA70}-\u{1FA74}\u{1FA78}-\u{1FA7C}\u{1FA80}-\u{1FA86}\u{1FA90}-\u{1FAAC}\u{1FAB0}-\u{1FABA}\u{1FAC0}-\u{1FAC5}\u{1FAD0}-\u{1FAD9}\u{1FAE0}-\u{1FAE7}\u{1FAF0}-\u{1FAF6}\u{1FB00}-\u{1FB92}\u{1FB94}-\u{1FBCA}\u{1FBF0}-\u{1FBF9}\u{E0001}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}]*$/u;
    var bidiS3 = /[0-9\xB2\xB3\xB9\u05BE\u05C0\u05C3\u05C6\u05D0-\u05EA\u05EF-\u05F4\u0600-\u0605\u0608\u060B\u060D\u061B-\u064A\u0660-\u0669\u066B-\u066F\u0671-\u06D5\u06DD\u06E5\u06E6\u06EE-\u070D\u070F\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07C0-\u07EA\u07F4\u07F5\u07FA\u07FE-\u0815\u081A\u0824\u0828\u0830-\u083E\u0840-\u0858\u085E\u0860-\u086A\u0870-\u088E\u0890\u0891\u08A0-\u08C9\u08E2\u200F\u2070\u2074-\u2079\u2080-\u2089\u2488-\u249B\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBC2\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFC\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\u{102E1}-\u{102FB}\u{10800}-\u{10805}\u{10808}\u{1080A}-\u{10835}\u{10837}\u{10838}\u{1083C}\u{1083F}-\u{10855}\u{10857}-\u{1089E}\u{108A7}-\u{108AF}\u{108E0}-\u{108F2}\u{108F4}\u{108F5}\u{108FB}-\u{1091B}\u{10920}-\u{10939}\u{1093F}\u{10980}-\u{109B7}\u{109BC}-\u{109CF}\u{109D2}-\u{10A00}\u{10A10}-\u{10A13}\u{10A15}-\u{10A17}\u{10A19}-\u{10A35}\u{10A40}-\u{10A48}\u{10A50}-\u{10A58}\u{10A60}-\u{10A9F}\u{10AC0}-\u{10AE4}\u{10AEB}-\u{10AF6}\u{10B00}-\u{10B35}\u{10B40}-\u{10B55}\u{10B58}-\u{10B72}\u{10B78}-\u{10B91}\u{10B99}-\u{10B9C}\u{10BA9}-\u{10BAF}\u{10C00}-\u{10C48}\u{10C80}-\u{10CB2}\u{10CC0}-\u{10CF2}\u{10CFA}-\u{10D23}\u{10D30}-\u{10D39}\u{10E60}-\u{10E7E}\u{10E80}-\u{10EA9}\u{10EAD}\u{10EB0}\u{10EB1}\u{10F00}-\u{10F27}\u{10F30}-\u{10F45}\u{10F51}-\u{10F59}\u{10F70}-\u{10F81}\u{10F86}-\u{10F89}\u{10FB0}-\u{10FCB}\u{10FE0}-\u{10FF6}\u{1D7CE}-\u{1D7FF}\u{1E800}-\u{1E8C4}\u{1E8C7}-\u{1E8CF}\u{1E900}-\u{1E943}\u{1E94B}\u{1E950}-\u{1E959}\u{1E95E}\u{1E95F}\u{1EC71}-\u{1ECB4}\u{1ED01}-\u{1ED3D}\u{1EE00}-\u{1EE03}\u{1EE05}-\u{1EE1F}\u{1EE21}\u{1EE22}\u{1EE24}\u{1EE27}\u{1EE29}-\u{1EE32}\u{1EE34}-\u{1EE37}\u{1EE39}\u{1EE3B}\u{1EE42}\u{1EE47}\u{1EE49}\u{1EE4B}\u{1EE4D}-\u{1EE4F}\u{1EE51}\u{1EE52}\u{1EE54}\u{1EE57}\u{1EE59}\u{1EE5B}\u{1EE5D}\u{1EE5F}\u{1EE61}\u{1EE62}\u{1EE64}\u{1EE67}-\u{1EE6A}\u{1EE6C}-\u{1EE72}\u{1EE74}-\u{1EE77}\u{1EE79}-\u{1EE7C}\u{1EE7E}\u{1EE80}-\u{1EE89}\u{1EE8B}-\u{1EE9B}\u{1EEA1}-\u{1EEA3}\u{1EEA5}-\u{1EEA9}\u{1EEAB}-\u{1EEBB}\u{1F100}-\u{1F10A}\u{1FBF0}-\u{1FBF9}][\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0898-\u089F\u08CA-\u08E1\u08E3-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u09FE\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B55\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C00\u0C04\u0C3C\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81\u0CBC\u0CCC\u0CCD\u0CE2\u0CE3\u0D00\u0D01\u0D3B\u0D3C\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0D81\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732\u1733\u1752\u1753\u1772\u1773\u17B4\u17B5\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u180F\u1885\u1886\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1A17\u1A18\u1A1B\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1AB0-\u1ACE\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BAB-\u1BAD\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1CF4\u1CF8\u1CF9\u1DC0-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302D\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA825\uA826\uA82C\uA8C4\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uA9BD\uA9E5\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAA7C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEC\uAAED\uAAF6\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\u{101FD}\u{102E0}\u{10376}-\u{1037A}\u{10A01}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A0F}\u{10A38}-\u{10A3A}\u{10A3F}\u{10AE5}\u{10AE6}\u{10D24}-\u{10D27}\u{10EAB}\u{10EAC}\u{10F46}-\u{10F50}\u{10F82}-\u{10F85}\u{11001}\u{11038}-\u{11046}\u{11070}\u{11073}\u{11074}\u{1107F}-\u{11081}\u{110B3}-\u{110B6}\u{110B9}\u{110BA}\u{110C2}\u{11100}-\u{11102}\u{11127}-\u{1112B}\u{1112D}-\u{11134}\u{11173}\u{11180}\u{11181}\u{111B6}-\u{111BE}\u{111C9}-\u{111CC}\u{111CF}\u{1122F}-\u{11231}\u{11234}\u{11236}\u{11237}\u{1123E}\u{112DF}\u{112E3}-\u{112EA}\u{11300}\u{11301}\u{1133B}\u{1133C}\u{11340}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11438}-\u{1143F}\u{11442}-\u{11444}\u{11446}\u{1145E}\u{114B3}-\u{114B8}\u{114BA}\u{114BF}\u{114C0}\u{114C2}\u{114C3}\u{115B2}-\u{115B5}\u{115BC}\u{115BD}\u{115BF}\u{115C0}\u{115DC}\u{115DD}\u{11633}-\u{1163A}\u{1163D}\u{1163F}\u{11640}\u{116AB}\u{116AD}\u{116B0}-\u{116B5}\u{116B7}\u{1171D}-\u{1171F}\u{11722}-\u{11725}\u{11727}-\u{1172B}\u{1182F}-\u{11837}\u{11839}\u{1183A}\u{1193B}\u{1193C}\u{1193E}\u{11943}\u{119D4}-\u{119D7}\u{119DA}\u{119DB}\u{119E0}\u{11A01}-\u{11A06}\u{11A09}\u{11A0A}\u{11A33}-\u{11A38}\u{11A3B}-\u{11A3E}\u{11A47}\u{11A51}-\u{11A56}\u{11A59}-\u{11A5B}\u{11A8A}-\u{11A96}\u{11A98}\u{11A99}\u{11C30}-\u{11C36}\u{11C38}-\u{11C3D}\u{11C92}-\u{11CA7}\u{11CAA}-\u{11CB0}\u{11CB2}\u{11CB3}\u{11CB5}\u{11CB6}\u{11D31}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D45}\u{11D47}\u{11D90}\u{11D91}\u{11D95}\u{11D97}\u{11EF3}\u{11EF4}\u{16AF0}-\u{16AF4}\u{16B30}-\u{16B36}\u{16F4F}\u{16F8F}-\u{16F92}\u{16FE4}\u{1BC9D}\u{1BC9E}\u{1CF00}-\u{1CF2D}\u{1CF30}-\u{1CF46}\u{1D167}-\u{1D169}\u{1D17B}-\u{1D182}\u{1D185}-\u{1D18B}\u{1D1AA}-\u{1D1AD}\u{1D242}-\u{1D244}\u{1DA00}-\u{1DA36}\u{1DA3B}-\u{1DA6C}\u{1DA75}\u{1DA84}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E130}-\u{1E136}\u{1E2AE}\u{1E2EC}-\u{1E2EF}\u{1E8D0}-\u{1E8D6}\u{1E944}-\u{1E94A}\u{E0100}-\u{E01EF}]*$/u;
    var bidiS4EN = /[0-9\xB2\xB3\xB9\u06F0-\u06F9\u2070\u2074-\u2079\u2080-\u2089\u2488-\u249B\uFF10-\uFF19\u{102E1}-\u{102FB}\u{1D7CE}-\u{1D7FF}\u{1F100}-\u{1F10A}\u{1FBF0}-\u{1FBF9}]/u;
    var bidiS4AN = /[\u0600-\u0605\u0660-\u0669\u066B\u066C\u06DD\u0890\u0891\u08E2\u{10D30}-\u{10D39}\u{10E60}-\u{10E7E}]/u;
    var bidiS5 = /^[\0-\x08\x0E-\x1B!-\x84\x86-\u0377\u037A-\u037F\u0384-\u038A\u038C\u038E-\u03A1\u03A3-\u052F\u0531-\u0556\u0559-\u058A\u058D-\u058F\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0606\u0607\u0609\u060A\u060C\u060E-\u061A\u064B-\u065F\u066A\u0670\u06D6-\u06DC\u06DE-\u06E4\u06E7-\u06ED\u06F0-\u06F9\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07F6-\u07F9\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0898-\u089F\u08CA-\u08E1\u08E3-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09FE\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A76\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AF1\u0AF9-\u0AFF\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B55-\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B77\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BFA\u0C00-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3C-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C5D\u0C60-\u0C63\u0C66-\u0C6F\u0C77-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDD\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D00-\u0D0C\u0D0E-\u0D10\u0D12-\u0D44\u0D46-\u0D48\u0D4A-\u0D4F\u0D54-\u0D63\u0D66-\u0D7F\u0D81-\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2-\u0DF4\u0E01-\u0E3A\u0E3F-\u0E5B\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00-\u0F47\u0F49-\u0F6C\u0F71-\u0F97\u0F99-\u0FBC\u0FBE-\u0FCC\u0FCE-\u0FDA\u1000-\u10C5\u10C7\u10CD\u10D0-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u137C\u1380-\u1399\u13A0-\u13F5\u13F8-\u13FD\u1400-\u167F\u1681-\u169C\u16A0-\u16F8\u1700-\u1715\u171F-\u1736\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17DD\u17E0-\u17E9\u17F0-\u17F9\u1800-\u1819\u1820-\u1878\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1940\u1944-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u19DE-\u1A1B\u1A1E-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA0-\u1AAD\u1AB0-\u1ACE\u1B00-\u1B4C\u1B50-\u1B7E\u1B80-\u1BF3\u1BFC-\u1C37\u1C3B-\u1C49\u1C4D-\u1C88\u1C90-\u1CBA\u1CBD-\u1CC7\u1CD0-\u1CFA\u1D00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FC4\u1FC6-\u1FD3\u1FD6-\u1FDB\u1FDD-\u1FEF\u1FF2-\u1FF4\u1FF6-\u1FFE\u200B-\u200E\u2010-\u2027\u202F-\u205E\u2060-\u2064\u206A-\u2071\u2074-\u208E\u2090-\u209C\u20A0-\u20C0\u20D0-\u20F0\u2100-\u218B\u2190-\u2426\u2440-\u244A\u2460-\u2B73\u2B76-\u2B95\u2B97-\u2CF3\u2CF9-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D70\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2E5D\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFB\u3001-\u303F\u3041-\u3096\u3099-\u30FF\u3105-\u312F\u3131-\u318E\u3190-\u31E3\u31F0-\u321E\u3220-\uA48C\uA490-\uA4C6\uA4D0-\uA62B\uA640-\uA6F7\uA700-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA82C\uA830-\uA839\uA840-\uA877\uA880-\uA8C5\uA8CE-\uA8D9\uA8E0-\uA953\uA95F-\uA97C\uA980-\uA9CD\uA9CF-\uA9D9\uA9DE-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA5C-\uAAC2\uAADB-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB6B\uAB70-\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uD800-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1E\uFB29\uFD3E-\uFD4F\uFDCF\uFDFD-\uFE19\uFE20-\uFE52\uFE54-\uFE66\uFE68-\uFE6B\uFEFF\uFF01-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFF9-\uFFFD\u{10000}-\u{1000B}\u{1000D}-\u{10026}\u{10028}-\u{1003A}\u{1003C}\u{1003D}\u{1003F}-\u{1004D}\u{10050}-\u{1005D}\u{10080}-\u{100FA}\u{10100}-\u{10102}\u{10107}-\u{10133}\u{10137}-\u{1018E}\u{10190}-\u{1019C}\u{101A0}\u{101D0}-\u{101FD}\u{10280}-\u{1029C}\u{102A0}-\u{102D0}\u{102E0}-\u{102FB}\u{10300}-\u{10323}\u{1032D}-\u{1034A}\u{10350}-\u{1037A}\u{10380}-\u{1039D}\u{1039F}-\u{103C3}\u{103C8}-\u{103D5}\u{10400}-\u{1049D}\u{104A0}-\u{104A9}\u{104B0}-\u{104D3}\u{104D8}-\u{104FB}\u{10500}-\u{10527}\u{10530}-\u{10563}\u{1056F}-\u{1057A}\u{1057C}-\u{1058A}\u{1058C}-\u{10592}\u{10594}\u{10595}\u{10597}-\u{105A1}\u{105A3}-\u{105B1}\u{105B3}-\u{105B9}\u{105BB}\u{105BC}\u{10600}-\u{10736}\u{10740}-\u{10755}\u{10760}-\u{10767}\u{10780}-\u{10785}\u{10787}-\u{107B0}\u{107B2}-\u{107BA}\u{1091F}\u{10A01}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A0F}\u{10A38}-\u{10A3A}\u{10A3F}\u{10AE5}\u{10AE6}\u{10B39}-\u{10B3F}\u{10D24}-\u{10D27}\u{10EAB}\u{10EAC}\u{10F46}-\u{10F50}\u{10F82}-\u{10F85}\u{11000}-\u{1104D}\u{11052}-\u{11075}\u{1107F}-\u{110C2}\u{110CD}\u{110D0}-\u{110E8}\u{110F0}-\u{110F9}\u{11100}-\u{11134}\u{11136}-\u{11147}\u{11150}-\u{11176}\u{11180}-\u{111DF}\u{111E1}-\u{111F4}\u{11200}-\u{11211}\u{11213}-\u{1123E}\u{11280}-\u{11286}\u{11288}\u{1128A}-\u{1128D}\u{1128F}-\u{1129D}\u{1129F}-\u{112A9}\u{112B0}-\u{112EA}\u{112F0}-\u{112F9}\u{11300}-\u{11303}\u{11305}-\u{1130C}\u{1130F}\u{11310}\u{11313}-\u{11328}\u{1132A}-\u{11330}\u{11332}\u{11333}\u{11335}-\u{11339}\u{1133B}-\u{11344}\u{11347}\u{11348}\u{1134B}-\u{1134D}\u{11350}\u{11357}\u{1135D}-\u{11363}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11400}-\u{1145B}\u{1145D}-\u{11461}\u{11480}-\u{114C7}\u{114D0}-\u{114D9}\u{11580}-\u{115B5}\u{115B8}-\u{115DD}\u{11600}-\u{11644}\u{11650}-\u{11659}\u{11660}-\u{1166C}\u{11680}-\u{116B9}\u{116C0}-\u{116C9}\u{11700}-\u{1171A}\u{1171D}-\u{1172B}\u{11730}-\u{11746}\u{11800}-\u{1183B}\u{118A0}-\u{118F2}\u{118FF}-\u{11906}\u{11909}\u{1190C}-\u{11913}\u{11915}\u{11916}\u{11918}-\u{11935}\u{11937}\u{11938}\u{1193B}-\u{11946}\u{11950}-\u{11959}\u{119A0}-\u{119A7}\u{119AA}-\u{119D7}\u{119DA}-\u{119E4}\u{11A00}-\u{11A47}\u{11A50}-\u{11AA2}\u{11AB0}-\u{11AF8}\u{11C00}-\u{11C08}\u{11C0A}-\u{11C36}\u{11C38}-\u{11C45}\u{11C50}-\u{11C6C}\u{11C70}-\u{11C8F}\u{11C92}-\u{11CA7}\u{11CA9}-\u{11CB6}\u{11D00}-\u{11D06}\u{11D08}\u{11D09}\u{11D0B}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D47}\u{11D50}-\u{11D59}\u{11D60}-\u{11D65}\u{11D67}\u{11D68}\u{11D6A}-\u{11D8E}\u{11D90}\u{11D91}\u{11D93}-\u{11D98}\u{11DA0}-\u{11DA9}\u{11EE0}-\u{11EF8}\u{11FB0}\u{11FC0}-\u{11FF1}\u{11FFF}-\u{12399}\u{12400}-\u{1246E}\u{12470}-\u{12474}\u{12480}-\u{12543}\u{12F90}-\u{12FF2}\u{13000}-\u{1342E}\u{13430}-\u{13438}\u{14400}-\u{14646}\u{16800}-\u{16A38}\u{16A40}-\u{16A5E}\u{16A60}-\u{16A69}\u{16A6E}-\u{16ABE}\u{16AC0}-\u{16AC9}\u{16AD0}-\u{16AED}\u{16AF0}-\u{16AF5}\u{16B00}-\u{16B45}\u{16B50}-\u{16B59}\u{16B5B}-\u{16B61}\u{16B63}-\u{16B77}\u{16B7D}-\u{16B8F}\u{16E40}-\u{16E9A}\u{16F00}-\u{16F4A}\u{16F4F}-\u{16F87}\u{16F8F}-\u{16F9F}\u{16FE0}-\u{16FE4}\u{16FF0}\u{16FF1}\u{17000}-\u{187F7}\u{18800}-\u{18CD5}\u{18D00}-\u{18D08}\u{1AFF0}-\u{1AFF3}\u{1AFF5}-\u{1AFFB}\u{1AFFD}\u{1AFFE}\u{1B000}-\u{1B122}\u{1B150}-\u{1B152}\u{1B164}-\u{1B167}\u{1B170}-\u{1B2FB}\u{1BC00}-\u{1BC6A}\u{1BC70}-\u{1BC7C}\u{1BC80}-\u{1BC88}\u{1BC90}-\u{1BC99}\u{1BC9C}-\u{1BCA3}\u{1CF00}-\u{1CF2D}\u{1CF30}-\u{1CF46}\u{1CF50}-\u{1CFC3}\u{1D000}-\u{1D0F5}\u{1D100}-\u{1D126}\u{1D129}-\u{1D1EA}\u{1D200}-\u{1D245}\u{1D2E0}-\u{1D2F3}\u{1D300}-\u{1D356}\u{1D360}-\u{1D378}\u{1D400}-\u{1D454}\u{1D456}-\u{1D49C}\u{1D49E}\u{1D49F}\u{1D4A2}\u{1D4A5}\u{1D4A6}\u{1D4A9}-\u{1D4AC}\u{1D4AE}-\u{1D4B9}\u{1D4BB}\u{1D4BD}-\u{1D4C3}\u{1D4C5}-\u{1D505}\u{1D507}-\u{1D50A}\u{1D50D}-\u{1D514}\u{1D516}-\u{1D51C}\u{1D51E}-\u{1D539}\u{1D53B}-\u{1D53E}\u{1D540}-\u{1D544}\u{1D546}\u{1D54A}-\u{1D550}\u{1D552}-\u{1D6A5}\u{1D6A8}-\u{1D7CB}\u{1D7CE}-\u{1DA8B}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1DF00}-\u{1DF1E}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E100}-\u{1E12C}\u{1E130}-\u{1E13D}\u{1E140}-\u{1E149}\u{1E14E}\u{1E14F}\u{1E290}-\u{1E2AE}\u{1E2C0}-\u{1E2F9}\u{1E2FF}\u{1E7E0}-\u{1E7E6}\u{1E7E8}-\u{1E7EB}\u{1E7ED}\u{1E7EE}\u{1E7F0}-\u{1E7FE}\u{1E8D0}-\u{1E8D6}\u{1E944}-\u{1E94A}\u{1EEF0}\u{1EEF1}\u{1F000}-\u{1F02B}\u{1F030}-\u{1F093}\u{1F0A0}-\u{1F0AE}\u{1F0B1}-\u{1F0BF}\u{1F0C1}-\u{1F0CF}\u{1F0D1}-\u{1F0F5}\u{1F100}-\u{1F1AD}\u{1F1E6}-\u{1F202}\u{1F210}-\u{1F23B}\u{1F240}-\u{1F248}\u{1F250}\u{1F251}\u{1F260}-\u{1F265}\u{1F300}-\u{1F6D7}\u{1F6DD}-\u{1F6EC}\u{1F6F0}-\u{1F6FC}\u{1F700}-\u{1F773}\u{1F780}-\u{1F7D8}\u{1F7E0}-\u{1F7EB}\u{1F7F0}\u{1F800}-\u{1F80B}\u{1F810}-\u{1F847}\u{1F850}-\u{1F859}\u{1F860}-\u{1F887}\u{1F890}-\u{1F8AD}\u{1F8B0}\u{1F8B1}\u{1F900}-\u{1FA53}\u{1FA60}-\u{1FA6D}\u{1FA70}-\u{1FA74}\u{1FA78}-\u{1FA7C}\u{1FA80}-\u{1FA86}\u{1FA90}-\u{1FAAC}\u{1FAB0}-\u{1FABA}\u{1FAC0}-\u{1FAC5}\u{1FAD0}-\u{1FAD9}\u{1FAE0}-\u{1FAE7}\u{1FAF0}-\u{1FAF6}\u{1FB00}-\u{1FB92}\u{1FB94}-\u{1FBCA}\u{1FBF0}-\u{1FBF9}\u{20000}-\u{2A6DF}\u{2A700}-\u{2B738}\u{2B740}-\u{2B81D}\u{2B820}-\u{2CEA1}\u{2CEB0}-\u{2EBE0}\u{2F800}-\u{2FA1D}\u{30000}-\u{3134A}\u{E0001}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]*$/u;
    var bidiS6 = /[0-9A-Za-z\xAA\xB2\xB3\xB5\xB9\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02B8\u02BB-\u02C1\u02D0\u02D1\u02E0-\u02E4\u02EE\u0370-\u0373\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0482\u048A-\u052F\u0531-\u0556\u0559-\u0589\u06F0-\u06F9\u0903-\u0939\u093B\u093D-\u0940\u0949-\u094C\u094E-\u0950\u0958-\u0961\u0964-\u0980\u0982\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD-\u09C0\u09C7\u09C8\u09CB\u09CC\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E1\u09E6-\u09F1\u09F4-\u09FA\u09FC\u09FD\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3E-\u0A40\u0A59-\u0A5C\u0A5E\u0A66-\u0A6F\u0A72-\u0A74\u0A76\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD-\u0AC0\u0AC9\u0ACB\u0ACC\u0AD0\u0AE0\u0AE1\u0AE6-\u0AF0\u0AF9\u0B02\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B3E\u0B40\u0B47\u0B48\u0B4B\u0B4C\u0B57\u0B5C\u0B5D\u0B5F-\u0B61\u0B66-\u0B77\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE\u0BBF\u0BC1\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCC\u0BD0\u0BD7\u0BE6-\u0BF2\u0C01-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C41-\u0C44\u0C58-\u0C5A\u0C5D\u0C60\u0C61\u0C66-\u0C6F\u0C77\u0C7F\u0C80\u0C82-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD-\u0CC4\u0CC6-\u0CC8\u0CCA\u0CCB\u0CD5\u0CD6\u0CDD\u0CDE\u0CE0\u0CE1\u0CE6-\u0CEF\u0CF1\u0CF2\u0D02-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D40\u0D46-\u0D48\u0D4A-\u0D4C\u0D4E\u0D4F\u0D54-\u0D61\u0D66-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCF-\u0DD1\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2-\u0DF4\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E4F-\u0E5B\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00-\u0F17\u0F1A-\u0F34\u0F36\u0F38\u0F3E-\u0F47\u0F49-\u0F6C\u0F7F\u0F85\u0F88-\u0F8C\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE-\u0FDA\u1000-\u102C\u1031\u1038\u103B\u103C\u103F-\u1057\u105A-\u105D\u1061-\u1070\u1075-\u1081\u1083\u1084\u1087-\u108C\u108E-\u109C\u109E-\u10C5\u10C7\u10CD\u10D0-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1360-\u137C\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u167F\u1681-\u169A\u16A0-\u16F8\u1700-\u1711\u1715\u171F-\u1731\u1734-\u1736\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17B6\u17BE-\u17C5\u17C7\u17C8\u17D4-\u17DA\u17DC\u17E0-\u17E9\u1810-\u1819\u1820-\u1878\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1923-\u1926\u1929-\u192B\u1930\u1931\u1933-\u1938\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A16\u1A19\u1A1A\u1A1E-\u1A55\u1A57\u1A61\u1A63\u1A64\u1A6D-\u1A72\u1A80-\u1A89\u1A90-\u1A99\u1AA0-\u1AAD\u1B04-\u1B33\u1B35\u1B3B\u1B3D-\u1B41\u1B43-\u1B4C\u1B50-\u1B6A\u1B74-\u1B7E\u1B82-\u1BA1\u1BA6\u1BA7\u1BAA\u1BAE-\u1BE5\u1BE7\u1BEA-\u1BEC\u1BEE\u1BF2\u1BF3\u1BFC-\u1C2B\u1C34\u1C35\u1C3B-\u1C49\u1C4D-\u1C88\u1C90-\u1CBA\u1CBD-\u1CC7\u1CD3\u1CE1\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5-\u1CF7\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200E\u2070\u2071\u2074-\u2079\u207F-\u2089\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u214F\u2160-\u2188\u2336-\u237A\u2395\u2488-\u24E9\u26AC\u2800-\u28FF\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D70\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u302E\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u3190-\u31BF\u31F0-\u321C\u3220-\u324F\u3260-\u327B\u327F-\u32B0\u32C0-\u32CB\u32D0-\u3376\u337B-\u33DD\u33E0-\u33FE\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA60C\uA610-\uA62B\uA640-\uA66E\uA680-\uA69D\uA6A0-\uA6EF\uA6F2-\uA6F7\uA722-\uA787\uA789-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F2-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA824\uA827\uA830-\uA837\uA840-\uA873\uA880-\uA8C3\uA8CE-\uA8D9\uA8F2-\uA8FE\uA900-\uA925\uA92E-\uA946\uA952\uA953\uA95F-\uA97C\uA983-\uA9B2\uA9B4\uA9B5\uA9BA\uA9BB\uA9BE-\uA9CD\uA9CF-\uA9D9\uA9DE-\uA9E4\uA9E6-\uA9FE\uAA00-\uAA28\uAA2F\uAA30\uAA33\uAA34\uAA40-\uAA42\uAA44-\uAA4B\uAA4D\uAA50-\uAA59\uAA5C-\uAA7B\uAA7D-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAAEB\uAAEE-\uAAF5\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB69\uAB70-\uABE4\uABE6\uABE7\uABE9-\uABEC\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uD800-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC\u{10000}-\u{1000B}\u{1000D}-\u{10026}\u{10028}-\u{1003A}\u{1003C}\u{1003D}\u{1003F}-\u{1004D}\u{10050}-\u{1005D}\u{10080}-\u{100FA}\u{10100}\u{10102}\u{10107}-\u{10133}\u{10137}-\u{1013F}\u{1018D}\u{1018E}\u{101D0}-\u{101FC}\u{10280}-\u{1029C}\u{102A0}-\u{102D0}\u{102E1}-\u{102FB}\u{10300}-\u{10323}\u{1032D}-\u{1034A}\u{10350}-\u{10375}\u{10380}-\u{1039D}\u{1039F}-\u{103C3}\u{103C8}-\u{103D5}\u{10400}-\u{1049D}\u{104A0}-\u{104A9}\u{104B0}-\u{104D3}\u{104D8}-\u{104FB}\u{10500}-\u{10527}\u{10530}-\u{10563}\u{1056F}-\u{1057A}\u{1057C}-\u{1058A}\u{1058C}-\u{10592}\u{10594}\u{10595}\u{10597}-\u{105A1}\u{105A3}-\u{105B1}\u{105B3}-\u{105B9}\u{105BB}\u{105BC}\u{10600}-\u{10736}\u{10740}-\u{10755}\u{10760}-\u{10767}\u{10780}-\u{10785}\u{10787}-\u{107B0}\u{107B2}-\u{107BA}\u{11000}\u{11002}-\u{11037}\u{11047}-\u{1104D}\u{11066}-\u{1106F}\u{11071}\u{11072}\u{11075}\u{11082}-\u{110B2}\u{110B7}\u{110B8}\u{110BB}-\u{110C1}\u{110CD}\u{110D0}-\u{110E8}\u{110F0}-\u{110F9}\u{11103}-\u{11126}\u{1112C}\u{11136}-\u{11147}\u{11150}-\u{11172}\u{11174}-\u{11176}\u{11182}-\u{111B5}\u{111BF}-\u{111C8}\u{111CD}\u{111CE}\u{111D0}-\u{111DF}\u{111E1}-\u{111F4}\u{11200}-\u{11211}\u{11213}-\u{1122E}\u{11232}\u{11233}\u{11235}\u{11238}-\u{1123D}\u{11280}-\u{11286}\u{11288}\u{1128A}-\u{1128D}\u{1128F}-\u{1129D}\u{1129F}-\u{112A9}\u{112B0}-\u{112DE}\u{112E0}-\u{112E2}\u{112F0}-\u{112F9}\u{11302}\u{11303}\u{11305}-\u{1130C}\u{1130F}\u{11310}\u{11313}-\u{11328}\u{1132A}-\u{11330}\u{11332}\u{11333}\u{11335}-\u{11339}\u{1133D}-\u{1133F}\u{11341}-\u{11344}\u{11347}\u{11348}\u{1134B}-\u{1134D}\u{11350}\u{11357}\u{1135D}-\u{11363}\u{11400}-\u{11437}\u{11440}\u{11441}\u{11445}\u{11447}-\u{1145B}\u{1145D}\u{1145F}-\u{11461}\u{11480}-\u{114B2}\u{114B9}\u{114BB}-\u{114BE}\u{114C1}\u{114C4}-\u{114C7}\u{114D0}-\u{114D9}\u{11580}-\u{115B1}\u{115B8}-\u{115BB}\u{115BE}\u{115C1}-\u{115DB}\u{11600}-\u{11632}\u{1163B}\u{1163C}\u{1163E}\u{11641}-\u{11644}\u{11650}-\u{11659}\u{11680}-\u{116AA}\u{116AC}\u{116AE}\u{116AF}\u{116B6}\u{116B8}\u{116B9}\u{116C0}-\u{116C9}\u{11700}-\u{1171A}\u{11720}\u{11721}\u{11726}\u{11730}-\u{11746}\u{11800}-\u{1182E}\u{11838}\u{1183B}\u{118A0}-\u{118F2}\u{118FF}-\u{11906}\u{11909}\u{1190C}-\u{11913}\u{11915}\u{11916}\u{11918}-\u{11935}\u{11937}\u{11938}\u{1193D}\u{1193F}-\u{11942}\u{11944}-\u{11946}\u{11950}-\u{11959}\u{119A0}-\u{119A7}\u{119AA}-\u{119D3}\u{119DC}-\u{119DF}\u{119E1}-\u{119E4}\u{11A00}\u{11A07}\u{11A08}\u{11A0B}-\u{11A32}\u{11A39}\u{11A3A}\u{11A3F}-\u{11A46}\u{11A50}\u{11A57}\u{11A58}\u{11A5C}-\u{11A89}\u{11A97}\u{11A9A}-\u{11AA2}\u{11AB0}-\u{11AF8}\u{11C00}-\u{11C08}\u{11C0A}-\u{11C2F}\u{11C3E}-\u{11C45}\u{11C50}-\u{11C6C}\u{11C70}-\u{11C8F}\u{11CA9}\u{11CB1}\u{11CB4}\u{11D00}-\u{11D06}\u{11D08}\u{11D09}\u{11D0B}-\u{11D30}\u{11D46}\u{11D50}-\u{11D59}\u{11D60}-\u{11D65}\u{11D67}\u{11D68}\u{11D6A}-\u{11D8E}\u{11D93}\u{11D94}\u{11D96}\u{11D98}\u{11DA0}-\u{11DA9}\u{11EE0}-\u{11EF2}\u{11EF5}-\u{11EF8}\u{11FB0}\u{11FC0}-\u{11FD4}\u{11FFF}-\u{12399}\u{12400}-\u{1246E}\u{12470}-\u{12474}\u{12480}-\u{12543}\u{12F90}-\u{12FF2}\u{13000}-\u{1342E}\u{13430}-\u{13438}\u{14400}-\u{14646}\u{16800}-\u{16A38}\u{16A40}-\u{16A5E}\u{16A60}-\u{16A69}\u{16A6E}-\u{16ABE}\u{16AC0}-\u{16AC9}\u{16AD0}-\u{16AED}\u{16AF5}\u{16B00}-\u{16B2F}\u{16B37}-\u{16B45}\u{16B50}-\u{16B59}\u{16B5B}-\u{16B61}\u{16B63}-\u{16B77}\u{16B7D}-\u{16B8F}\u{16E40}-\u{16E9A}\u{16F00}-\u{16F4A}\u{16F50}-\u{16F87}\u{16F93}-\u{16F9F}\u{16FE0}\u{16FE1}\u{16FE3}\u{16FF0}\u{16FF1}\u{17000}-\u{187F7}\u{18800}-\u{18CD5}\u{18D00}-\u{18D08}\u{1AFF0}-\u{1AFF3}\u{1AFF5}-\u{1AFFB}\u{1AFFD}\u{1AFFE}\u{1B000}-\u{1B122}\u{1B150}-\u{1B152}\u{1B164}-\u{1B167}\u{1B170}-\u{1B2FB}\u{1BC00}-\u{1BC6A}\u{1BC70}-\u{1BC7C}\u{1BC80}-\u{1BC88}\u{1BC90}-\u{1BC99}\u{1BC9C}\u{1BC9F}\u{1CF50}-\u{1CFC3}\u{1D000}-\u{1D0F5}\u{1D100}-\u{1D126}\u{1D129}-\u{1D166}\u{1D16A}-\u{1D172}\u{1D183}\u{1D184}\u{1D18C}-\u{1D1A9}\u{1D1AE}-\u{1D1E8}\u{1D2E0}-\u{1D2F3}\u{1D360}-\u{1D378}\u{1D400}-\u{1D454}\u{1D456}-\u{1D49C}\u{1D49E}\u{1D49F}\u{1D4A2}\u{1D4A5}\u{1D4A6}\u{1D4A9}-\u{1D4AC}\u{1D4AE}-\u{1D4B9}\u{1D4BB}\u{1D4BD}-\u{1D4C3}\u{1D4C5}-\u{1D505}\u{1D507}-\u{1D50A}\u{1D50D}-\u{1D514}\u{1D516}-\u{1D51C}\u{1D51E}-\u{1D539}\u{1D53B}-\u{1D53E}\u{1D540}-\u{1D544}\u{1D546}\u{1D54A}-\u{1D550}\u{1D552}-\u{1D6A5}\u{1D6A8}-\u{1D6DA}\u{1D6DC}-\u{1D714}\u{1D716}-\u{1D74E}\u{1D750}-\u{1D788}\u{1D78A}-\u{1D7C2}\u{1D7C4}-\u{1D7CB}\u{1D7CE}-\u{1D9FF}\u{1DA37}-\u{1DA3A}\u{1DA6D}-\u{1DA74}\u{1DA76}-\u{1DA83}\u{1DA85}-\u{1DA8B}\u{1DF00}-\u{1DF1E}\u{1E100}-\u{1E12C}\u{1E137}-\u{1E13D}\u{1E140}-\u{1E149}\u{1E14E}\u{1E14F}\u{1E290}-\u{1E2AD}\u{1E2C0}-\u{1E2EB}\u{1E2F0}-\u{1E2F9}\u{1E7E0}-\u{1E7E6}\u{1E7E8}-\u{1E7EB}\u{1E7ED}\u{1E7EE}\u{1E7F0}-\u{1E7FE}\u{1F100}-\u{1F10A}\u{1F110}-\u{1F12E}\u{1F130}-\u{1F169}\u{1F170}-\u{1F1AC}\u{1F1E6}-\u{1F202}\u{1F210}-\u{1F23B}\u{1F240}-\u{1F248}\u{1F250}\u{1F251}\u{1FBF0}-\u{1FBF9}\u{20000}-\u{2A6DF}\u{2A700}-\u{2B738}\u{2B740}-\u{2B81D}\u{2B820}-\u{2CEA1}\u{2CEB0}-\u{2EBE0}\u{2F800}-\u{2FA1D}\u{30000}-\u{3134A}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}][\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0898-\u089F\u08CA-\u08E1\u08E3-\u0902\u093A\u093C\u0941-\u0948\u094D\u0951-\u0957\u0962\u0963\u0981\u09BC\u09C1-\u09C4\u09CD\u09E2\u09E3\u09FE\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1-\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01\u0B3C\u0B3F\u0B41-\u0B44\u0B4D\u0B55\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C00\u0C04\u0C3C\u0C3E-\u0C40\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81\u0CBC\u0CCC\u0CCD\u0CE2\u0CE3\u0D00\u0D01\u0D3B\u0D3C\u0D41-\u0D44\u0D4D\u0D62\u0D63\u0D81\u0DCA\u0DD2-\u0DD4\u0DD6\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71-\u0F7E\u0F80-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102D-\u1030\u1032-\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E-\u1060\u1071-\u1074\u1082\u1085\u1086\u108D\u109D\u135D-\u135F\u1712-\u1714\u1732\u1733\u1752\u1753\u1772\u1773\u17B4\u17B5\u17B7-\u17BD\u17C6\u17C9-\u17D3\u17DD\u180B-\u180D\u180F\u1885\u1886\u18A9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193B\u1A17\u1A18\u1A1B\u1A56\u1A58-\u1A5E\u1A60\u1A62\u1A65-\u1A6C\u1A73-\u1A7C\u1A7F\u1AB0-\u1ACE\u1B00-\u1B03\u1B34\u1B36-\u1B3A\u1B3C\u1B42\u1B6B-\u1B73\u1B80\u1B81\u1BA2-\u1BA5\u1BA8\u1BA9\u1BAB-\u1BAD\u1BE6\u1BE8\u1BE9\u1BED\u1BEF-\u1BF1\u1C2C-\u1C33\u1C36\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE0\u1CE2-\u1CE8\u1CED\u1CF4\u1CF8\u1CF9\u1DC0-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302D\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA825\uA826\uA82C\uA8C4\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA951\uA980-\uA982\uA9B3\uA9B6-\uA9B9\uA9BC\uA9BD\uA9E5\uAA29-\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uAA7C\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEC\uAAED\uAAF6\uABE5\uABE8\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\u{101FD}\u{102E0}\u{10376}-\u{1037A}\u{10A01}-\u{10A03}\u{10A05}\u{10A06}\u{10A0C}-\u{10A0F}\u{10A38}-\u{10A3A}\u{10A3F}\u{10AE5}\u{10AE6}\u{10D24}-\u{10D27}\u{10EAB}\u{10EAC}\u{10F46}-\u{10F50}\u{10F82}-\u{10F85}\u{11001}\u{11038}-\u{11046}\u{11070}\u{11073}\u{11074}\u{1107F}-\u{11081}\u{110B3}-\u{110B6}\u{110B9}\u{110BA}\u{110C2}\u{11100}-\u{11102}\u{11127}-\u{1112B}\u{1112D}-\u{11134}\u{11173}\u{11180}\u{11181}\u{111B6}-\u{111BE}\u{111C9}-\u{111CC}\u{111CF}\u{1122F}-\u{11231}\u{11234}\u{11236}\u{11237}\u{1123E}\u{112DF}\u{112E3}-\u{112EA}\u{11300}\u{11301}\u{1133B}\u{1133C}\u{11340}\u{11366}-\u{1136C}\u{11370}-\u{11374}\u{11438}-\u{1143F}\u{11442}-\u{11444}\u{11446}\u{1145E}\u{114B3}-\u{114B8}\u{114BA}\u{114BF}\u{114C0}\u{114C2}\u{114C3}\u{115B2}-\u{115B5}\u{115BC}\u{115BD}\u{115BF}\u{115C0}\u{115DC}\u{115DD}\u{11633}-\u{1163A}\u{1163D}\u{1163F}\u{11640}\u{116AB}\u{116AD}\u{116B0}-\u{116B5}\u{116B7}\u{1171D}-\u{1171F}\u{11722}-\u{11725}\u{11727}-\u{1172B}\u{1182F}-\u{11837}\u{11839}\u{1183A}\u{1193B}\u{1193C}\u{1193E}\u{11943}\u{119D4}-\u{119D7}\u{119DA}\u{119DB}\u{119E0}\u{11A01}-\u{11A06}\u{11A09}\u{11A0A}\u{11A33}-\u{11A38}\u{11A3B}-\u{11A3E}\u{11A47}\u{11A51}-\u{11A56}\u{11A59}-\u{11A5B}\u{11A8A}-\u{11A96}\u{11A98}\u{11A99}\u{11C30}-\u{11C36}\u{11C38}-\u{11C3D}\u{11C92}-\u{11CA7}\u{11CAA}-\u{11CB0}\u{11CB2}\u{11CB3}\u{11CB5}\u{11CB6}\u{11D31}-\u{11D36}\u{11D3A}\u{11D3C}\u{11D3D}\u{11D3F}-\u{11D45}\u{11D47}\u{11D90}\u{11D91}\u{11D95}\u{11D97}\u{11EF3}\u{11EF4}\u{16AF0}-\u{16AF4}\u{16B30}-\u{16B36}\u{16F4F}\u{16F8F}-\u{16F92}\u{16FE4}\u{1BC9D}\u{1BC9E}\u{1CF00}-\u{1CF2D}\u{1CF30}-\u{1CF46}\u{1D167}-\u{1D169}\u{1D17B}-\u{1D182}\u{1D185}-\u{1D18B}\u{1D1AA}-\u{1D1AD}\u{1D242}-\u{1D244}\u{1DA00}-\u{1DA36}\u{1DA3B}-\u{1DA6C}\u{1DA75}\u{1DA84}\u{1DA9B}-\u{1DA9F}\u{1DAA1}-\u{1DAAF}\u{1E000}-\u{1E006}\u{1E008}-\u{1E018}\u{1E01B}-\u{1E021}\u{1E023}\u{1E024}\u{1E026}-\u{1E02A}\u{1E130}-\u{1E136}\u{1E2AE}\u{1E2EC}-\u{1E2EF}\u{1E8D0}-\u{1E8D6}\u{1E944}-\u{1E94A}\u{E0100}-\u{E01EF}]*$/u;
    module2.exports = {
      combiningMarks,
      combiningClassVirama,
      validZWNJ,
      bidiDomain,
      bidiS1LTR,
      bidiS1RTL,
      bidiS2,
      bidiS3,
      bidiS4EN,
      bidiS4AN,
      bidiS5,
      bidiS6
    };
  }
});

// ../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/lib/mappingTable.json
var require_mappingTable = __commonJS({
  "../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/lib/mappingTable.json"(exports, module2) {
    module2.exports = [[[0, 44], 4], [[45, 46], 2], [47, 4], [[48, 57], 2], [[58, 64], 4], [65, 1, "a"], [66, 1, "b"], [67, 1, "c"], [68, 1, "d"], [69, 1, "e"], [70, 1, "f"], [71, 1, "g"], [72, 1, "h"], [73, 1, "i"], [74, 1, "j"], [75, 1, "k"], [76, 1, "l"], [77, 1, "m"], [78, 1, "n"], [79, 1, "o"], [80, 1, "p"], [81, 1, "q"], [82, 1, "r"], [83, 1, "s"], [84, 1, "t"], [85, 1, "u"], [86, 1, "v"], [87, 1, "w"], [88, 1, "x"], [89, 1, "y"], [90, 1, "z"], [[91, 96], 4], [[97, 122], 2], [[123, 127], 4], [[128, 159], 3], [160, 5, " "], [[161, 167], 2], [168, 5, " \u0308"], [169, 2], [170, 1, "a"], [[171, 172], 2], [173, 7], [174, 2], [175, 5, " \u0304"], [[176, 177], 2], [178, 1, "2"], [179, 1, "3"], [180, 5, " \u0301"], [181, 1, "\u03BC"], [182, 2], [183, 2], [184, 5, " \u0327"], [185, 1, "1"], [186, 1, "o"], [187, 2], [188, 1, "1\u20444"], [189, 1, "1\u20442"], [190, 1, "3\u20444"], [191, 2], [192, 1, "\xE0"], [193, 1, "\xE1"], [194, 1, "\xE2"], [195, 1, "\xE3"], [196, 1, "\xE4"], [197, 1, "\xE5"], [198, 1, "\xE6"], [199, 1, "\xE7"], [200, 1, "\xE8"], [201, 1, "\xE9"], [202, 1, "\xEA"], [203, 1, "\xEB"], [204, 1, "\xEC"], [205, 1, "\xED"], [206, 1, "\xEE"], [207, 1, "\xEF"], [208, 1, "\xF0"], [209, 1, "\xF1"], [210, 1, "\xF2"], [211, 1, "\xF3"], [212, 1, "\xF4"], [213, 1, "\xF5"], [214, 1, "\xF6"], [215, 2], [216, 1, "\xF8"], [217, 1, "\xF9"], [218, 1, "\xFA"], [219, 1, "\xFB"], [220, 1, "\xFC"], [221, 1, "\xFD"], [222, 1, "\xFE"], [223, 6, "ss"], [[224, 246], 2], [247, 2], [[248, 255], 2], [256, 1, "\u0101"], [257, 2], [258, 1, "\u0103"], [259, 2], [260, 1, "\u0105"], [261, 2], [262, 1, "\u0107"], [263, 2], [264, 1, "\u0109"], [265, 2], [266, 1, "\u010B"], [267, 2], [268, 1, "\u010D"], [269, 2], [270, 1, "\u010F"], [271, 2], [272, 1, "\u0111"], [273, 2], [274, 1, "\u0113"], [275, 2], [276, 1, "\u0115"], [277, 2], [278, 1, "\u0117"], [279, 2], [280, 1, "\u0119"], [281, 2], [282, 1, "\u011B"], [283, 2], [284, 1, "\u011D"], [285, 2], [286, 1, "\u011F"], [287, 2], [288, 1, "\u0121"], [289, 2], [290, 1, "\u0123"], [291, 2], [292, 1, "\u0125"], [293, 2], [294, 1, "\u0127"], [295, 2], [296, 1, "\u0129"], [297, 2], [298, 1, "\u012B"], [299, 2], [300, 1, "\u012D"], [301, 2], [302, 1, "\u012F"], [303, 2], [304, 1, "i\u0307"], [305, 2], [[306, 307], 1, "ij"], [308, 1, "\u0135"], [309, 2], [310, 1, "\u0137"], [[311, 312], 2], [313, 1, "\u013A"], [314, 2], [315, 1, "\u013C"], [316, 2], [317, 1, "\u013E"], [318, 2], [[319, 320], 1, "l\xB7"], [321, 1, "\u0142"], [322, 2], [323, 1, "\u0144"], [324, 2], [325, 1, "\u0146"], [326, 2], [327, 1, "\u0148"], [328, 2], [329, 1, "\u02BCn"], [330, 1, "\u014B"], [331, 2], [332, 1, "\u014D"], [333, 2], [334, 1, "\u014F"], [335, 2], [336, 1, "\u0151"], [337, 2], [338, 1, "\u0153"], [339, 2], [340, 1, "\u0155"], [341, 2], [342, 1, "\u0157"], [343, 2], [344, 1, "\u0159"], [345, 2], [346, 1, "\u015B"], [347, 2], [348, 1, "\u015D"], [349, 2], [350, 1, "\u015F"], [351, 2], [352, 1, "\u0161"], [353, 2], [354, 1, "\u0163"], [355, 2], [356, 1, "\u0165"], [357, 2], [358, 1, "\u0167"], [359, 2], [360, 1, "\u0169"], [361, 2], [362, 1, "\u016B"], [363, 2], [364, 1, "\u016D"], [365, 2], [366, 1, "\u016F"], [367, 2], [368, 1, "\u0171"], [369, 2], [370, 1, "\u0173"], [371, 2], [372, 1, "\u0175"], [373, 2], [374, 1, "\u0177"], [375, 2], [376, 1, "\xFF"], [377, 1, "\u017A"], [378, 2], [379, 1, "\u017C"], [380, 2], [381, 1, "\u017E"], [382, 2], [383, 1, "s"], [384, 2], [385, 1, "\u0253"], [386, 1, "\u0183"], [387, 2], [388, 1, "\u0185"], [389, 2], [390, 1, "\u0254"], [391, 1, "\u0188"], [392, 2], [393, 1, "\u0256"], [394, 1, "\u0257"], [395, 1, "\u018C"], [[396, 397], 2], [398, 1, "\u01DD"], [399, 1, "\u0259"], [400, 1, "\u025B"], [401, 1, "\u0192"], [402, 2], [403, 1, "\u0260"], [404, 1, "\u0263"], [405, 2], [406, 1, "\u0269"], [407, 1, "\u0268"], [408, 1, "\u0199"], [[409, 411], 2], [412, 1, "\u026F"], [413, 1, "\u0272"], [414, 2], [415, 1, "\u0275"], [416, 1, "\u01A1"], [417, 2], [418, 1, "\u01A3"], [419, 2], [420, 1, "\u01A5"], [421, 2], [422, 1, "\u0280"], [423, 1, "\u01A8"], [424, 2], [425, 1, "\u0283"], [[426, 427], 2], [428, 1, "\u01AD"], [429, 2], [430, 1, "\u0288"], [431, 1, "\u01B0"], [432, 2], [433, 1, "\u028A"], [434, 1, "\u028B"], [435, 1, "\u01B4"], [436, 2], [437, 1, "\u01B6"], [438, 2], [439, 1, "\u0292"], [440, 1, "\u01B9"], [[441, 443], 2], [444, 1, "\u01BD"], [[445, 451], 2], [[452, 454], 1, "d\u017E"], [[455, 457], 1, "lj"], [[458, 460], 1, "nj"], [461, 1, "\u01CE"], [462, 2], [463, 1, "\u01D0"], [464, 2], [465, 1, "\u01D2"], [466, 2], [467, 1, "\u01D4"], [468, 2], [469, 1, "\u01D6"], [470, 2], [471, 1, "\u01D8"], [472, 2], [473, 1, "\u01DA"], [474, 2], [475, 1, "\u01DC"], [[476, 477], 2], [478, 1, "\u01DF"], [479, 2], [480, 1, "\u01E1"], [481, 2], [482, 1, "\u01E3"], [483, 2], [484, 1, "\u01E5"], [485, 2], [486, 1, "\u01E7"], [487, 2], [488, 1, "\u01E9"], [489, 2], [490, 1, "\u01EB"], [491, 2], [492, 1, "\u01ED"], [493, 2], [494, 1, "\u01EF"], [[495, 496], 2], [[497, 499], 1, "dz"], [500, 1, "\u01F5"], [501, 2], [502, 1, "\u0195"], [503, 1, "\u01BF"], [504, 1, "\u01F9"], [505, 2], [506, 1, "\u01FB"], [507, 2], [508, 1, "\u01FD"], [509, 2], [510, 1, "\u01FF"], [511, 2], [512, 1, "\u0201"], [513, 2], [514, 1, "\u0203"], [515, 2], [516, 1, "\u0205"], [517, 2], [518, 1, "\u0207"], [519, 2], [520, 1, "\u0209"], [521, 2], [522, 1, "\u020B"], [523, 2], [524, 1, "\u020D"], [525, 2], [526, 1, "\u020F"], [527, 2], [528, 1, "\u0211"], [529, 2], [530, 1, "\u0213"], [531, 2], [532, 1, "\u0215"], [533, 2], [534, 1, "\u0217"], [535, 2], [536, 1, "\u0219"], [537, 2], [538, 1, "\u021B"], [539, 2], [540, 1, "\u021D"], [541, 2], [542, 1, "\u021F"], [543, 2], [544, 1, "\u019E"], [545, 2], [546, 1, "\u0223"], [547, 2], [548, 1, "\u0225"], [549, 2], [550, 1, "\u0227"], [551, 2], [552, 1, "\u0229"], [553, 2], [554, 1, "\u022B"], [555, 2], [556, 1, "\u022D"], [557, 2], [558, 1, "\u022F"], [559, 2], [560, 1, "\u0231"], [561, 2], [562, 1, "\u0233"], [563, 2], [[564, 566], 2], [[567, 569], 2], [570, 1, "\u2C65"], [571, 1, "\u023C"], [572, 2], [573, 1, "\u019A"], [574, 1, "\u2C66"], [[575, 576], 2], [577, 1, "\u0242"], [578, 2], [579, 1, "\u0180"], [580, 1, "\u0289"], [581, 1, "\u028C"], [582, 1, "\u0247"], [583, 2], [584, 1, "\u0249"], [585, 2], [586, 1, "\u024B"], [587, 2], [588, 1, "\u024D"], [589, 2], [590, 1, "\u024F"], [591, 2], [[592, 680], 2], [[681, 685], 2], [[686, 687], 2], [688, 1, "h"], [689, 1, "\u0266"], [690, 1, "j"], [691, 1, "r"], [692, 1, "\u0279"], [693, 1, "\u027B"], [694, 1, "\u0281"], [695, 1, "w"], [696, 1, "y"], [[697, 705], 2], [[706, 709], 2], [[710, 721], 2], [[722, 727], 2], [728, 5, " \u0306"], [729, 5, " \u0307"], [730, 5, " \u030A"], [731, 5, " \u0328"], [732, 5, " \u0303"], [733, 5, " \u030B"], [734, 2], [735, 2], [736, 1, "\u0263"], [737, 1, "l"], [738, 1, "s"], [739, 1, "x"], [740, 1, "\u0295"], [[741, 745], 2], [[746, 747], 2], [748, 2], [749, 2], [750, 2], [[751, 767], 2], [[768, 831], 2], [832, 1, "\u0300"], [833, 1, "\u0301"], [834, 2], [835, 1, "\u0313"], [836, 1, "\u0308\u0301"], [837, 1, "\u03B9"], [[838, 846], 2], [847, 7], [[848, 855], 2], [[856, 860], 2], [[861, 863], 2], [[864, 865], 2], [866, 2], [[867, 879], 2], [880, 1, "\u0371"], [881, 2], [882, 1, "\u0373"], [883, 2], [884, 1, "\u02B9"], [885, 2], [886, 1, "\u0377"], [887, 2], [[888, 889], 3], [890, 5, " \u03B9"], [[891, 893], 2], [894, 5, ";"], [895, 1, "\u03F3"], [[896, 899], 3], [900, 5, " \u0301"], [901, 5, " \u0308\u0301"], [902, 1, "\u03AC"], [903, 1, "\xB7"], [904, 1, "\u03AD"], [905, 1, "\u03AE"], [906, 1, "\u03AF"], [907, 3], [908, 1, "\u03CC"], [909, 3], [910, 1, "\u03CD"], [911, 1, "\u03CE"], [912, 2], [913, 1, "\u03B1"], [914, 1, "\u03B2"], [915, 1, "\u03B3"], [916, 1, "\u03B4"], [917, 1, "\u03B5"], [918, 1, "\u03B6"], [919, 1, "\u03B7"], [920, 1, "\u03B8"], [921, 1, "\u03B9"], [922, 1, "\u03BA"], [923, 1, "\u03BB"], [924, 1, "\u03BC"], [925, 1, "\u03BD"], [926, 1, "\u03BE"], [927, 1, "\u03BF"], [928, 1, "\u03C0"], [929, 1, "\u03C1"], [930, 3], [931, 1, "\u03C3"], [932, 1, "\u03C4"], [933, 1, "\u03C5"], [934, 1, "\u03C6"], [935, 1, "\u03C7"], [936, 1, "\u03C8"], [937, 1, "\u03C9"], [938, 1, "\u03CA"], [939, 1, "\u03CB"], [[940, 961], 2], [962, 6, "\u03C3"], [[963, 974], 2], [975, 1, "\u03D7"], [976, 1, "\u03B2"], [977, 1, "\u03B8"], [978, 1, "\u03C5"], [979, 1, "\u03CD"], [980, 1, "\u03CB"], [981, 1, "\u03C6"], [982, 1, "\u03C0"], [983, 2], [984, 1, "\u03D9"], [985, 2], [986, 1, "\u03DB"], [987, 2], [988, 1, "\u03DD"], [989, 2], [990, 1, "\u03DF"], [991, 2], [992, 1, "\u03E1"], [993, 2], [994, 1, "\u03E3"], [995, 2], [996, 1, "\u03E5"], [997, 2], [998, 1, "\u03E7"], [999, 2], [1e3, 1, "\u03E9"], [1001, 2], [1002, 1, "\u03EB"], [1003, 2], [1004, 1, "\u03ED"], [1005, 2], [1006, 1, "\u03EF"], [1007, 2], [1008, 1, "\u03BA"], [1009, 1, "\u03C1"], [1010, 1, "\u03C3"], [1011, 2], [1012, 1, "\u03B8"], [1013, 1, "\u03B5"], [1014, 2], [1015, 1, "\u03F8"], [1016, 2], [1017, 1, "\u03C3"], [1018, 1, "\u03FB"], [1019, 2], [1020, 2], [1021, 1, "\u037B"], [1022, 1, "\u037C"], [1023, 1, "\u037D"], [1024, 1, "\u0450"], [1025, 1, "\u0451"], [1026, 1, "\u0452"], [1027, 1, "\u0453"], [1028, 1, "\u0454"], [1029, 1, "\u0455"], [1030, 1, "\u0456"], [1031, 1, "\u0457"], [1032, 1, "\u0458"], [1033, 1, "\u0459"], [1034, 1, "\u045A"], [1035, 1, "\u045B"], [1036, 1, "\u045C"], [1037, 1, "\u045D"], [1038, 1, "\u045E"], [1039, 1, "\u045F"], [1040, 1, "\u0430"], [1041, 1, "\u0431"], [1042, 1, "\u0432"], [1043, 1, "\u0433"], [1044, 1, "\u0434"], [1045, 1, "\u0435"], [1046, 1, "\u0436"], [1047, 1, "\u0437"], [1048, 1, "\u0438"], [1049, 1, "\u0439"], [1050, 1, "\u043A"], [1051, 1, "\u043B"], [1052, 1, "\u043C"], [1053, 1, "\u043D"], [1054, 1, "\u043E"], [1055, 1, "\u043F"], [1056, 1, "\u0440"], [1057, 1, "\u0441"], [1058, 1, "\u0442"], [1059, 1, "\u0443"], [1060, 1, "\u0444"], [1061, 1, "\u0445"], [1062, 1, "\u0446"], [1063, 1, "\u0447"], [1064, 1, "\u0448"], [1065, 1, "\u0449"], [1066, 1, "\u044A"], [1067, 1, "\u044B"], [1068, 1, "\u044C"], [1069, 1, "\u044D"], [1070, 1, "\u044E"], [1071, 1, "\u044F"], [[1072, 1103], 2], [1104, 2], [[1105, 1116], 2], [1117, 2], [[1118, 1119], 2], [1120, 1, "\u0461"], [1121, 2], [1122, 1, "\u0463"], [1123, 2], [1124, 1, "\u0465"], [1125, 2], [1126, 1, "\u0467"], [1127, 2], [1128, 1, "\u0469"], [1129, 2], [1130, 1, "\u046B"], [1131, 2], [1132, 1, "\u046D"], [1133, 2], [1134, 1, "\u046F"], [1135, 2], [1136, 1, "\u0471"], [1137, 2], [1138, 1, "\u0473"], [1139, 2], [1140, 1, "\u0475"], [1141, 2], [1142, 1, "\u0477"], [1143, 2], [1144, 1, "\u0479"], [1145, 2], [1146, 1, "\u047B"], [1147, 2], [1148, 1, "\u047D"], [1149, 2], [1150, 1, "\u047F"], [1151, 2], [1152, 1, "\u0481"], [1153, 2], [1154, 2], [[1155, 1158], 2], [1159, 2], [[1160, 1161], 2], [1162, 1, "\u048B"], [1163, 2], [1164, 1, "\u048D"], [1165, 2], [1166, 1, "\u048F"], [1167, 2], [1168, 1, "\u0491"], [1169, 2], [1170, 1, "\u0493"], [1171, 2], [1172, 1, "\u0495"], [1173, 2], [1174, 1, "\u0497"], [1175, 2], [1176, 1, "\u0499"], [1177, 2], [1178, 1, "\u049B"], [1179, 2], [1180, 1, "\u049D"], [1181, 2], [1182, 1, "\u049F"], [1183, 2], [1184, 1, "\u04A1"], [1185, 2], [1186, 1, "\u04A3"], [1187, 2], [1188, 1, "\u04A5"], [1189, 2], [1190, 1, "\u04A7"], [1191, 2], [1192, 1, "\u04A9"], [1193, 2], [1194, 1, "\u04AB"], [1195, 2], [1196, 1, "\u04AD"], [1197, 2], [1198, 1, "\u04AF"], [1199, 2], [1200, 1, "\u04B1"], [1201, 2], [1202, 1, "\u04B3"], [1203, 2], [1204, 1, "\u04B5"], [1205, 2], [1206, 1, "\u04B7"], [1207, 2], [1208, 1, "\u04B9"], [1209, 2], [1210, 1, "\u04BB"], [1211, 2], [1212, 1, "\u04BD"], [1213, 2], [1214, 1, "\u04BF"], [1215, 2], [1216, 3], [1217, 1, "\u04C2"], [1218, 2], [1219, 1, "\u04C4"], [1220, 2], [1221, 1, "\u04C6"], [1222, 2], [1223, 1, "\u04C8"], [1224, 2], [1225, 1, "\u04CA"], [1226, 2], [1227, 1, "\u04CC"], [1228, 2], [1229, 1, "\u04CE"], [1230, 2], [1231, 2], [1232, 1, "\u04D1"], [1233, 2], [1234, 1, "\u04D3"], [1235, 2], [1236, 1, "\u04D5"], [1237, 2], [1238, 1, "\u04D7"], [1239, 2], [1240, 1, "\u04D9"], [1241, 2], [1242, 1, "\u04DB"], [1243, 2], [1244, 1, "\u04DD"], [1245, 2], [1246, 1, "\u04DF"], [1247, 2], [1248, 1, "\u04E1"], [1249, 2], [1250, 1, "\u04E3"], [1251, 2], [1252, 1, "\u04E5"], [1253, 2], [1254, 1, "\u04E7"], [1255, 2], [1256, 1, "\u04E9"], [1257, 2], [1258, 1, "\u04EB"], [1259, 2], [1260, 1, "\u04ED"], [1261, 2], [1262, 1, "\u04EF"], [1263, 2], [1264, 1, "\u04F1"], [1265, 2], [1266, 1, "\u04F3"], [1267, 2], [1268, 1, "\u04F5"], [1269, 2], [1270, 1, "\u04F7"], [1271, 2], [1272, 1, "\u04F9"], [1273, 2], [1274, 1, "\u04FB"], [1275, 2], [1276, 1, "\u04FD"], [1277, 2], [1278, 1, "\u04FF"], [1279, 2], [1280, 1, "\u0501"], [1281, 2], [1282, 1, "\u0503"], [1283, 2], [1284, 1, "\u0505"], [1285, 2], [1286, 1, "\u0507"], [1287, 2], [1288, 1, "\u0509"], [1289, 2], [1290, 1, "\u050B"], [1291, 2], [1292, 1, "\u050D"], [1293, 2], [1294, 1, "\u050F"], [1295, 2], [1296, 1, "\u0511"], [1297, 2], [1298, 1, "\u0513"], [1299, 2], [1300, 1, "\u0515"], [1301, 2], [1302, 1, "\u0517"], [1303, 2], [1304, 1, "\u0519"], [1305, 2], [1306, 1, "\u051B"], [1307, 2], [1308, 1, "\u051D"], [1309, 2], [1310, 1, "\u051F"], [1311, 2], [1312, 1, "\u0521"], [1313, 2], [1314, 1, "\u0523"], [1315, 2], [1316, 1, "\u0525"], [1317, 2], [1318, 1, "\u0527"], [1319, 2], [1320, 1, "\u0529"], [1321, 2], [1322, 1, "\u052B"], [1323, 2], [1324, 1, "\u052D"], [1325, 2], [1326, 1, "\u052F"], [1327, 2], [1328, 3], [1329, 1, "\u0561"], [1330, 1, "\u0562"], [1331, 1, "\u0563"], [1332, 1, "\u0564"], [1333, 1, "\u0565"], [1334, 1, "\u0566"], [1335, 1, "\u0567"], [1336, 1, "\u0568"], [1337, 1, "\u0569"], [1338, 1, "\u056A"], [1339, 1, "\u056B"], [1340, 1, "\u056C"], [1341, 1, "\u056D"], [1342, 1, "\u056E"], [1343, 1, "\u056F"], [1344, 1, "\u0570"], [1345, 1, "\u0571"], [1346, 1, "\u0572"], [1347, 1, "\u0573"], [1348, 1, "\u0574"], [1349, 1, "\u0575"], [1350, 1, "\u0576"], [1351, 1, "\u0577"], [1352, 1, "\u0578"], [1353, 1, "\u0579"], [1354, 1, "\u057A"], [1355, 1, "\u057B"], [1356, 1, "\u057C"], [1357, 1, "\u057D"], [1358, 1, "\u057E"], [1359, 1, "\u057F"], [1360, 1, "\u0580"], [1361, 1, "\u0581"], [1362, 1, "\u0582"], [1363, 1, "\u0583"], [1364, 1, "\u0584"], [1365, 1, "\u0585"], [1366, 1, "\u0586"], [[1367, 1368], 3], [1369, 2], [[1370, 1375], 2], [1376, 2], [[1377, 1414], 2], [1415, 1, "\u0565\u0582"], [1416, 2], [1417, 2], [1418, 2], [[1419, 1420], 3], [[1421, 1422], 2], [1423, 2], [1424, 3], [[1425, 1441], 2], [1442, 2], [[1443, 1455], 2], [[1456, 1465], 2], [1466, 2], [[1467, 1469], 2], [1470, 2], [1471, 2], [1472, 2], [[1473, 1474], 2], [1475, 2], [1476, 2], [1477, 2], [1478, 2], [1479, 2], [[1480, 1487], 3], [[1488, 1514], 2], [[1515, 1518], 3], [1519, 2], [[1520, 1524], 2], [[1525, 1535], 3], [[1536, 1539], 3], [1540, 3], [1541, 3], [[1542, 1546], 2], [1547, 2], [1548, 2], [[1549, 1551], 2], [[1552, 1557], 2], [[1558, 1562], 2], [1563, 2], [1564, 3], [1565, 2], [1566, 2], [1567, 2], [1568, 2], [[1569, 1594], 2], [[1595, 1599], 2], [1600, 2], [[1601, 1618], 2], [[1619, 1621], 2], [[1622, 1624], 2], [[1625, 1630], 2], [1631, 2], [[1632, 1641], 2], [[1642, 1645], 2], [[1646, 1647], 2], [[1648, 1652], 2], [1653, 1, "\u0627\u0674"], [1654, 1, "\u0648\u0674"], [1655, 1, "\u06C7\u0674"], [1656, 1, "\u064A\u0674"], [[1657, 1719], 2], [[1720, 1721], 2], [[1722, 1726], 2], [1727, 2], [[1728, 1742], 2], [1743, 2], [[1744, 1747], 2], [1748, 2], [[1749, 1756], 2], [1757, 3], [1758, 2], [[1759, 1768], 2], [1769, 2], [[1770, 1773], 2], [[1774, 1775], 2], [[1776, 1785], 2], [[1786, 1790], 2], [1791, 2], [[1792, 1805], 2], [1806, 3], [1807, 3], [[1808, 1836], 2], [[1837, 1839], 2], [[1840, 1866], 2], [[1867, 1868], 3], [[1869, 1871], 2], [[1872, 1901], 2], [[1902, 1919], 2], [[1920, 1968], 2], [1969, 2], [[1970, 1983], 3], [[1984, 2037], 2], [[2038, 2042], 2], [[2043, 2044], 3], [2045, 2], [[2046, 2047], 2], [[2048, 2093], 2], [[2094, 2095], 3], [[2096, 2110], 2], [2111, 3], [[2112, 2139], 2], [[2140, 2141], 3], [2142, 2], [2143, 3], [[2144, 2154], 2], [[2155, 2159], 3], [[2160, 2183], 2], [2184, 2], [[2185, 2190], 2], [2191, 3], [[2192, 2193], 3], [[2194, 2199], 3], [[2200, 2207], 2], [2208, 2], [2209, 2], [[2210, 2220], 2], [[2221, 2226], 2], [[2227, 2228], 2], [2229, 2], [[2230, 2237], 2], [[2238, 2247], 2], [[2248, 2258], 2], [2259, 2], [[2260, 2273], 2], [2274, 3], [2275, 2], [[2276, 2302], 2], [2303, 2], [2304, 2], [[2305, 2307], 2], [2308, 2], [[2309, 2361], 2], [[2362, 2363], 2], [[2364, 2381], 2], [2382, 2], [2383, 2], [[2384, 2388], 2], [2389, 2], [[2390, 2391], 2], [2392, 1, "\u0915\u093C"], [2393, 1, "\u0916\u093C"], [2394, 1, "\u0917\u093C"], [2395, 1, "\u091C\u093C"], [2396, 1, "\u0921\u093C"], [2397, 1, "\u0922\u093C"], [2398, 1, "\u092B\u093C"], [2399, 1, "\u092F\u093C"], [[2400, 2403], 2], [[2404, 2405], 2], [[2406, 2415], 2], [2416, 2], [[2417, 2418], 2], [[2419, 2423], 2], [2424, 2], [[2425, 2426], 2], [[2427, 2428], 2], [2429, 2], [[2430, 2431], 2], [2432, 2], [[2433, 2435], 2], [2436, 3], [[2437, 2444], 2], [[2445, 2446], 3], [[2447, 2448], 2], [[2449, 2450], 3], [[2451, 2472], 2], [2473, 3], [[2474, 2480], 2], [2481, 3], [2482, 2], [[2483, 2485], 3], [[2486, 2489], 2], [[2490, 2491], 3], [2492, 2], [2493, 2], [[2494, 2500], 2], [[2501, 2502], 3], [[2503, 2504], 2], [[2505, 2506], 3], [[2507, 2509], 2], [2510, 2], [[2511, 2518], 3], [2519, 2], [[2520, 2523], 3], [2524, 1, "\u09A1\u09BC"], [2525, 1, "\u09A2\u09BC"], [2526, 3], [2527, 1, "\u09AF\u09BC"], [[2528, 2531], 2], [[2532, 2533], 3], [[2534, 2545], 2], [[2546, 2554], 2], [2555, 2], [2556, 2], [2557, 2], [2558, 2], [[2559, 2560], 3], [2561, 2], [2562, 2], [2563, 2], [2564, 3], [[2565, 2570], 2], [[2571, 2574], 3], [[2575, 2576], 2], [[2577, 2578], 3], [[2579, 2600], 2], [2601, 3], [[2602, 2608], 2], [2609, 3], [2610, 2], [2611, 1, "\u0A32\u0A3C"], [2612, 3], [2613, 2], [2614, 1, "\u0A38\u0A3C"], [2615, 3], [[2616, 2617], 2], [[2618, 2619], 3], [2620, 2], [2621, 3], [[2622, 2626], 2], [[2627, 2630], 3], [[2631, 2632], 2], [[2633, 2634], 3], [[2635, 2637], 2], [[2638, 2640], 3], [2641, 2], [[2642, 2648], 3], [2649, 1, "\u0A16\u0A3C"], [2650, 1, "\u0A17\u0A3C"], [2651, 1, "\u0A1C\u0A3C"], [2652, 2], [2653, 3], [2654, 1, "\u0A2B\u0A3C"], [[2655, 2661], 3], [[2662, 2676], 2], [2677, 2], [2678, 2], [[2679, 2688], 3], [[2689, 2691], 2], [2692, 3], [[2693, 2699], 2], [2700, 2], [2701, 2], [2702, 3], [[2703, 2705], 2], [2706, 3], [[2707, 2728], 2], [2729, 3], [[2730, 2736], 2], [2737, 3], [[2738, 2739], 2], [2740, 3], [[2741, 2745], 2], [[2746, 2747], 3], [[2748, 2757], 2], [2758, 3], [[2759, 2761], 2], [2762, 3], [[2763, 2765], 2], [[2766, 2767], 3], [2768, 2], [[2769, 2783], 3], [2784, 2], [[2785, 2787], 2], [[2788, 2789], 3], [[2790, 2799], 2], [2800, 2], [2801, 2], [[2802, 2808], 3], [2809, 2], [[2810, 2815], 2], [2816, 3], [[2817, 2819], 2], [2820, 3], [[2821, 2828], 2], [[2829, 2830], 3], [[2831, 2832], 2], [[2833, 2834], 3], [[2835, 2856], 2], [2857, 3], [[2858, 2864], 2], [2865, 3], [[2866, 2867], 2], [2868, 3], [2869, 2], [[2870, 2873], 2], [[2874, 2875], 3], [[2876, 2883], 2], [2884, 2], [[2885, 2886], 3], [[2887, 2888], 2], [[2889, 2890], 3], [[2891, 2893], 2], [[2894, 2900], 3], [2901, 2], [[2902, 2903], 2], [[2904, 2907], 3], [2908, 1, "\u0B21\u0B3C"], [2909, 1, "\u0B22\u0B3C"], [2910, 3], [[2911, 2913], 2], [[2914, 2915], 2], [[2916, 2917], 3], [[2918, 2927], 2], [2928, 2], [2929, 2], [[2930, 2935], 2], [[2936, 2945], 3], [[2946, 2947], 2], [2948, 3], [[2949, 2954], 2], [[2955, 2957], 3], [[2958, 2960], 2], [2961, 3], [[2962, 2965], 2], [[2966, 2968], 3], [[2969, 2970], 2], [2971, 3], [2972, 2], [2973, 3], [[2974, 2975], 2], [[2976, 2978], 3], [[2979, 2980], 2], [[2981, 2983], 3], [[2984, 2986], 2], [[2987, 2989], 3], [[2990, 2997], 2], [2998, 2], [[2999, 3001], 2], [[3002, 3005], 3], [[3006, 3010], 2], [[3011, 3013], 3], [[3014, 3016], 2], [3017, 3], [[3018, 3021], 2], [[3022, 3023], 3], [3024, 2], [[3025, 3030], 3], [3031, 2], [[3032, 3045], 3], [3046, 2], [[3047, 3055], 2], [[3056, 3058], 2], [[3059, 3066], 2], [[3067, 3071], 3], [3072, 2], [[3073, 3075], 2], [3076, 2], [[3077, 3084], 2], [3085, 3], [[3086, 3088], 2], [3089, 3], [[3090, 3112], 2], [3113, 3], [[3114, 3123], 2], [3124, 2], [[3125, 3129], 2], [[3130, 3131], 3], [3132, 2], [3133, 2], [[3134, 3140], 2], [3141, 3], [[3142, 3144], 2], [3145, 3], [[3146, 3149], 2], [[3150, 3156], 3], [[3157, 3158], 2], [3159, 3], [[3160, 3161], 2], [3162, 2], [[3163, 3164], 3], [3165, 2], [[3166, 3167], 3], [[3168, 3169], 2], [[3170, 3171], 2], [[3172, 3173], 3], [[3174, 3183], 2], [[3184, 3190], 3], [3191, 2], [[3192, 3199], 2], [3200, 2], [3201, 2], [[3202, 3203], 2], [3204, 2], [[3205, 3212], 2], [3213, 3], [[3214, 3216], 2], [3217, 3], [[3218, 3240], 2], [3241, 3], [[3242, 3251], 2], [3252, 3], [[3253, 3257], 2], [[3258, 3259], 3], [[3260, 3261], 2], [[3262, 3268], 2], [3269, 3], [[3270, 3272], 2], [3273, 3], [[3274, 3277], 2], [[3278, 3284], 3], [[3285, 3286], 2], [[3287, 3292], 3], [3293, 2], [3294, 2], [3295, 3], [[3296, 3297], 2], [[3298, 3299], 2], [[3300, 3301], 3], [[3302, 3311], 2], [3312, 3], [[3313, 3314], 2], [[3315, 3327], 3], [3328, 2], [3329, 2], [[3330, 3331], 2], [3332, 2], [[3333, 3340], 2], [3341, 3], [[3342, 3344], 2], [3345, 3], [[3346, 3368], 2], [3369, 2], [[3370, 3385], 2], [3386, 2], [[3387, 3388], 2], [3389, 2], [[3390, 3395], 2], [3396, 2], [3397, 3], [[3398, 3400], 2], [3401, 3], [[3402, 3405], 2], [3406, 2], [3407, 2], [[3408, 3411], 3], [[3412, 3414], 2], [3415, 2], [[3416, 3422], 2], [3423, 2], [[3424, 3425], 2], [[3426, 3427], 2], [[3428, 3429], 3], [[3430, 3439], 2], [[3440, 3445], 2], [[3446, 3448], 2], [3449, 2], [[3450, 3455], 2], [3456, 3], [3457, 2], [[3458, 3459], 2], [3460, 3], [[3461, 3478], 2], [[3479, 3481], 3], [[3482, 3505], 2], [3506, 3], [[3507, 3515], 2], [3516, 3], [3517, 2], [[3518, 3519], 3], [[3520, 3526], 2], [[3527, 3529], 3], [3530, 2], [[3531, 3534], 3], [[3535, 3540], 2], [3541, 3], [3542, 2], [3543, 3], [[3544, 3551], 2], [[3552, 3557], 3], [[3558, 3567], 2], [[3568, 3569], 3], [[3570, 3571], 2], [3572, 2], [[3573, 3584], 3], [[3585, 3634], 2], [3635, 1, "\u0E4D\u0E32"], [[3636, 3642], 2], [[3643, 3646], 3], [3647, 2], [[3648, 3662], 2], [3663, 2], [[3664, 3673], 2], [[3674, 3675], 2], [[3676, 3712], 3], [[3713, 3714], 2], [3715, 3], [3716, 2], [3717, 3], [3718, 2], [[3719, 3720], 2], [3721, 2], [3722, 2], [3723, 3], [3724, 2], [3725, 2], [[3726, 3731], 2], [[3732, 3735], 2], [3736, 2], [[3737, 3743], 2], [3744, 2], [[3745, 3747], 2], [3748, 3], [3749, 2], [3750, 3], [3751, 2], [[3752, 3753], 2], [[3754, 3755], 2], [3756, 2], [[3757, 3762], 2], [3763, 1, "\u0ECD\u0EB2"], [[3764, 3769], 2], [3770, 2], [[3771, 3773], 2], [[3774, 3775], 3], [[3776, 3780], 2], [3781, 3], [3782, 2], [3783, 3], [[3784, 3789], 2], [[3790, 3791], 3], [[3792, 3801], 2], [[3802, 3803], 3], [3804, 1, "\u0EAB\u0E99"], [3805, 1, "\u0EAB\u0EA1"], [[3806, 3807], 2], [[3808, 3839], 3], [3840, 2], [[3841, 3850], 2], [3851, 2], [3852, 1, "\u0F0B"], [[3853, 3863], 2], [[3864, 3865], 2], [[3866, 3871], 2], [[3872, 3881], 2], [[3882, 3892], 2], [3893, 2], [3894, 2], [3895, 2], [3896, 2], [3897, 2], [[3898, 3901], 2], [[3902, 3906], 2], [3907, 1, "\u0F42\u0FB7"], [[3908, 3911], 2], [3912, 3], [[3913, 3916], 2], [3917, 1, "\u0F4C\u0FB7"], [[3918, 3921], 2], [3922, 1, "\u0F51\u0FB7"], [[3923, 3926], 2], [3927, 1, "\u0F56\u0FB7"], [[3928, 3931], 2], [3932, 1, "\u0F5B\u0FB7"], [[3933, 3944], 2], [3945, 1, "\u0F40\u0FB5"], [3946, 2], [[3947, 3948], 2], [[3949, 3952], 3], [[3953, 3954], 2], [3955, 1, "\u0F71\u0F72"], [3956, 2], [3957, 1, "\u0F71\u0F74"], [3958, 1, "\u0FB2\u0F80"], [3959, 1, "\u0FB2\u0F71\u0F80"], [3960, 1, "\u0FB3\u0F80"], [3961, 1, "\u0FB3\u0F71\u0F80"], [[3962, 3968], 2], [3969, 1, "\u0F71\u0F80"], [[3970, 3972], 2], [3973, 2], [[3974, 3979], 2], [[3980, 3983], 2], [[3984, 3986], 2], [3987, 1, "\u0F92\u0FB7"], [[3988, 3989], 2], [3990, 2], [3991, 2], [3992, 3], [[3993, 3996], 2], [3997, 1, "\u0F9C\u0FB7"], [[3998, 4001], 2], [4002, 1, "\u0FA1\u0FB7"], [[4003, 4006], 2], [4007, 1, "\u0FA6\u0FB7"], [[4008, 4011], 2], [4012, 1, "\u0FAB\u0FB7"], [4013, 2], [[4014, 4016], 2], [[4017, 4023], 2], [4024, 2], [4025, 1, "\u0F90\u0FB5"], [[4026, 4028], 2], [4029, 3], [[4030, 4037], 2], [4038, 2], [[4039, 4044], 2], [4045, 3], [4046, 2], [4047, 2], [[4048, 4049], 2], [[4050, 4052], 2], [[4053, 4056], 2], [[4057, 4058], 2], [[4059, 4095], 3], [[4096, 4129], 2], [4130, 2], [[4131, 4135], 2], [4136, 2], [[4137, 4138], 2], [4139, 2], [[4140, 4146], 2], [[4147, 4149], 2], [[4150, 4153], 2], [[4154, 4159], 2], [[4160, 4169], 2], [[4170, 4175], 2], [[4176, 4185], 2], [[4186, 4249], 2], [[4250, 4253], 2], [[4254, 4255], 2], [[4256, 4293], 3], [4294, 3], [4295, 1, "\u2D27"], [[4296, 4300], 3], [4301, 1, "\u2D2D"], [[4302, 4303], 3], [[4304, 4342], 2], [[4343, 4344], 2], [[4345, 4346], 2], [4347, 2], [4348, 1, "\u10DC"], [[4349, 4351], 2], [[4352, 4441], 2], [[4442, 4446], 2], [[4447, 4448], 3], [[4449, 4514], 2], [[4515, 4519], 2], [[4520, 4601], 2], [[4602, 4607], 2], [[4608, 4614], 2], [4615, 2], [[4616, 4678], 2], [4679, 2], [4680, 2], [4681, 3], [[4682, 4685], 2], [[4686, 4687], 3], [[4688, 4694], 2], [4695, 3], [4696, 2], [4697, 3], [[4698, 4701], 2], [[4702, 4703], 3], [[4704, 4742], 2], [4743, 2], [4744, 2], [4745, 3], [[4746, 4749], 2], [[4750, 4751], 3], [[4752, 4782], 2], [4783, 2], [4784, 2], [4785, 3], [[4786, 4789], 2], [[4790, 4791], 3], [[4792, 4798], 2], [4799, 3], [4800, 2], [4801, 3], [[4802, 4805], 2], [[4806, 4807], 3], [[4808, 4814], 2], [4815, 2], [[4816, 4822], 2], [4823, 3], [[4824, 4846], 2], [4847, 2], [[4848, 4878], 2], [4879, 2], [4880, 2], [4881, 3], [[4882, 4885], 2], [[4886, 4887], 3], [[4888, 4894], 2], [4895, 2], [[4896, 4934], 2], [4935, 2], [[4936, 4954], 2], [[4955, 4956], 3], [[4957, 4958], 2], [4959, 2], [4960, 2], [[4961, 4988], 2], [[4989, 4991], 3], [[4992, 5007], 2], [[5008, 5017], 2], [[5018, 5023], 3], [[5024, 5108], 2], [5109, 2], [[5110, 5111], 3], [5112, 1, "\u13F0"], [5113, 1, "\u13F1"], [5114, 1, "\u13F2"], [5115, 1, "\u13F3"], [5116, 1, "\u13F4"], [5117, 1, "\u13F5"], [[5118, 5119], 3], [5120, 2], [[5121, 5740], 2], [[5741, 5742], 2], [[5743, 5750], 2], [[5751, 5759], 2], [5760, 3], [[5761, 5786], 2], [[5787, 5788], 2], [[5789, 5791], 3], [[5792, 5866], 2], [[5867, 5872], 2], [[5873, 5880], 2], [[5881, 5887], 3], [[5888, 5900], 2], [5901, 2], [[5902, 5908], 2], [5909, 2], [[5910, 5918], 3], [5919, 2], [[5920, 5940], 2], [[5941, 5942], 2], [[5943, 5951], 3], [[5952, 5971], 2], [[5972, 5983], 3], [[5984, 5996], 2], [5997, 3], [[5998, 6e3], 2], [6001, 3], [[6002, 6003], 2], [[6004, 6015], 3], [[6016, 6067], 2], [[6068, 6069], 3], [[6070, 6099], 2], [[6100, 6102], 2], [6103, 2], [[6104, 6107], 2], [6108, 2], [6109, 2], [[6110, 6111], 3], [[6112, 6121], 2], [[6122, 6127], 3], [[6128, 6137], 2], [[6138, 6143], 3], [[6144, 6149], 2], [6150, 3], [[6151, 6154], 2], [[6155, 6157], 7], [6158, 3], [6159, 7], [[6160, 6169], 2], [[6170, 6175], 3], [[6176, 6263], 2], [6264, 2], [[6265, 6271], 3], [[6272, 6313], 2], [6314, 2], [[6315, 6319], 3], [[6320, 6389], 2], [[6390, 6399], 3], [[6400, 6428], 2], [[6429, 6430], 2], [6431, 3], [[6432, 6443], 2], [[6444, 6447], 3], [[6448, 6459], 2], [[6460, 6463], 3], [6464, 2], [[6465, 6467], 3], [[6468, 6469], 2], [[6470, 6509], 2], [[6510, 6511], 3], [[6512, 6516], 2], [[6517, 6527], 3], [[6528, 6569], 2], [[6570, 6571], 2], [[6572, 6575], 3], [[6576, 6601], 2], [[6602, 6607], 3], [[6608, 6617], 2], [6618, 2], [[6619, 6621], 3], [[6622, 6623], 2], [[6624, 6655], 2], [[6656, 6683], 2], [[6684, 6685], 3], [[6686, 6687], 2], [[6688, 6750], 2], [6751, 3], [[6752, 6780], 2], [[6781, 6782], 3], [[6783, 6793], 2], [[6794, 6799], 3], [[6800, 6809], 2], [[6810, 6815], 3], [[6816, 6822], 2], [6823, 2], [[6824, 6829], 2], [[6830, 6831], 3], [[6832, 6845], 2], [6846, 2], [[6847, 6848], 2], [[6849, 6862], 2], [[6863, 6911], 3], [[6912, 6987], 2], [6988, 2], [[6989, 6991], 3], [[6992, 7001], 2], [[7002, 7018], 2], [[7019, 7027], 2], [[7028, 7036], 2], [[7037, 7038], 2], [7039, 3], [[7040, 7082], 2], [[7083, 7085], 2], [[7086, 7097], 2], [[7098, 7103], 2], [[7104, 7155], 2], [[7156, 7163], 3], [[7164, 7167], 2], [[7168, 7223], 2], [[7224, 7226], 3], [[7227, 7231], 2], [[7232, 7241], 2], [[7242, 7244], 3], [[7245, 7293], 2], [[7294, 7295], 2], [7296, 1, "\u0432"], [7297, 1, "\u0434"], [7298, 1, "\u043E"], [7299, 1, "\u0441"], [[7300, 7301], 1, "\u0442"], [7302, 1, "\u044A"], [7303, 1, "\u0463"], [7304, 1, "\uA64B"], [[7305, 7311], 3], [7312, 1, "\u10D0"], [7313, 1, "\u10D1"], [7314, 1, "\u10D2"], [7315, 1, "\u10D3"], [7316, 1, "\u10D4"], [7317, 1, "\u10D5"], [7318, 1, "\u10D6"], [7319, 1, "\u10D7"], [7320, 1, "\u10D8"], [7321, 1, "\u10D9"], [7322, 1, "\u10DA"], [7323, 1, "\u10DB"], [7324, 1, "\u10DC"], [7325, 1, "\u10DD"], [7326, 1, "\u10DE"], [7327, 1, "\u10DF"], [7328, 1, "\u10E0"], [7329, 1, "\u10E1"], [7330, 1, "\u10E2"], [7331, 1, "\u10E3"], [7332, 1, "\u10E4"], [7333, 1, "\u10E5"], [7334, 1, "\u10E6"], [7335, 1, "\u10E7"], [7336, 1, "\u10E8"], [7337, 1, "\u10E9"], [7338, 1, "\u10EA"], [7339, 1, "\u10EB"], [7340, 1, "\u10EC"], [7341, 1, "\u10ED"], [7342, 1, "\u10EE"], [7343, 1, "\u10EF"], [7344, 1, "\u10F0"], [7345, 1, "\u10F1"], [7346, 1, "\u10F2"], [7347, 1, "\u10F3"], [7348, 1, "\u10F4"], [7349, 1, "\u10F5"], [7350, 1, "\u10F6"], [7351, 1, "\u10F7"], [7352, 1, "\u10F8"], [7353, 1, "\u10F9"], [7354, 1, "\u10FA"], [[7355, 7356], 3], [7357, 1, "\u10FD"], [7358, 1, "\u10FE"], [7359, 1, "\u10FF"], [[7360, 7367], 2], [[7368, 7375], 3], [[7376, 7378], 2], [7379, 2], [[7380, 7410], 2], [[7411, 7414], 2], [7415, 2], [[7416, 7417], 2], [7418, 2], [[7419, 7423], 3], [[7424, 7467], 2], [7468, 1, "a"], [7469, 1, "\xE6"], [7470, 1, "b"], [7471, 2], [7472, 1, "d"], [7473, 1, "e"], [7474, 1, "\u01DD"], [7475, 1, "g"], [7476, 1, "h"], [7477, 1, "i"], [7478, 1, "j"], [7479, 1, "k"], [7480, 1, "l"], [7481, 1, "m"], [7482, 1, "n"], [7483, 2], [7484, 1, "o"], [7485, 1, "\u0223"], [7486, 1, "p"], [7487, 1, "r"], [7488, 1, "t"], [7489, 1, "u"], [7490, 1, "w"], [7491, 1, "a"], [7492, 1, "\u0250"], [7493, 1, "\u0251"], [7494, 1, "\u1D02"], [7495, 1, "b"], [7496, 1, "d"], [7497, 1, "e"], [7498, 1, "\u0259"], [7499, 1, "\u025B"], [7500, 1, "\u025C"], [7501, 1, "g"], [7502, 2], [7503, 1, "k"], [7504, 1, "m"], [7505, 1, "\u014B"], [7506, 1, "o"], [7507, 1, "\u0254"], [7508, 1, "\u1D16"], [7509, 1, "\u1D17"], [7510, 1, "p"], [7511, 1, "t"], [7512, 1, "u"], [7513, 1, "\u1D1D"], [7514, 1, "\u026F"], [7515, 1, "v"], [7516, 1, "\u1D25"], [7517, 1, "\u03B2"], [7518, 1, "\u03B3"], [7519, 1, "\u03B4"], [7520, 1, "\u03C6"], [7521, 1, "\u03C7"], [7522, 1, "i"], [7523, 1, "r"], [7524, 1, "u"], [7525, 1, "v"], [7526, 1, "\u03B2"], [7527, 1, "\u03B3"], [7528, 1, "\u03C1"], [7529, 1, "\u03C6"], [7530, 1, "\u03C7"], [7531, 2], [[7532, 7543], 2], [7544, 1, "\u043D"], [[7545, 7578], 2], [7579, 1, "\u0252"], [7580, 1, "c"], [7581, 1, "\u0255"], [7582, 1, "\xF0"], [7583, 1, "\u025C"], [7584, 1, "f"], [7585, 1, "\u025F"], [7586, 1, "\u0261"], [7587, 1, "\u0265"], [7588, 1, "\u0268"], [7589, 1, "\u0269"], [7590, 1, "\u026A"], [7591, 1, "\u1D7B"], [7592, 1, "\u029D"], [7593, 1, "\u026D"], [7594, 1, "\u1D85"], [7595, 1, "\u029F"], [7596, 1, "\u0271"], [7597, 1, "\u0270"], [7598, 1, "\u0272"], [7599, 1, "\u0273"], [7600, 1, "\u0274"], [7601, 1, "\u0275"], [7602, 1, "\u0278"], [7603, 1, "\u0282"], [7604, 1, "\u0283"], [7605, 1, "\u01AB"], [7606, 1, "\u0289"], [7607, 1, "\u028A"], [7608, 1, "\u1D1C"], [7609, 1, "\u028B"], [7610, 1, "\u028C"], [7611, 1, "z"], [7612, 1, "\u0290"], [7613, 1, "\u0291"], [7614, 1, "\u0292"], [7615, 1, "\u03B8"], [[7616, 7619], 2], [[7620, 7626], 2], [[7627, 7654], 2], [[7655, 7669], 2], [[7670, 7673], 2], [7674, 2], [7675, 2], [7676, 2], [7677, 2], [[7678, 7679], 2], [7680, 1, "\u1E01"], [7681, 2], [7682, 1, "\u1E03"], [7683, 2], [7684, 1, "\u1E05"], [7685, 2], [7686, 1, "\u1E07"], [7687, 2], [7688, 1, "\u1E09"], [7689, 2], [7690, 1, "\u1E0B"], [7691, 2], [7692, 1, "\u1E0D"], [7693, 2], [7694, 1, "\u1E0F"], [7695, 2], [7696, 1, "\u1E11"], [7697, 2], [7698, 1, "\u1E13"], [7699, 2], [7700, 1, "\u1E15"], [7701, 2], [7702, 1, "\u1E17"], [7703, 2], [7704, 1, "\u1E19"], [7705, 2], [7706, 1, "\u1E1B"], [7707, 2], [7708, 1, "\u1E1D"], [7709, 2], [7710, 1, "\u1E1F"], [7711, 2], [7712, 1, "\u1E21"], [7713, 2], [7714, 1, "\u1E23"], [7715, 2], [7716, 1, "\u1E25"], [7717, 2], [7718, 1, "\u1E27"], [7719, 2], [7720, 1, "\u1E29"], [7721, 2], [7722, 1, "\u1E2B"], [7723, 2], [7724, 1, "\u1E2D"], [7725, 2], [7726, 1, "\u1E2F"], [7727, 2], [7728, 1, "\u1E31"], [7729, 2], [7730, 1, "\u1E33"], [7731, 2], [7732, 1, "\u1E35"], [7733, 2], [7734, 1, "\u1E37"], [7735, 2], [7736, 1, "\u1E39"], [7737, 2], [7738, 1, "\u1E3B"], [7739, 2], [7740, 1, "\u1E3D"], [7741, 2], [7742, 1, "\u1E3F"], [7743, 2], [7744, 1, "\u1E41"], [7745, 2], [7746, 1, "\u1E43"], [7747, 2], [7748, 1, "\u1E45"], [7749, 2], [7750, 1, "\u1E47"], [7751, 2], [7752, 1, "\u1E49"], [7753, 2], [7754, 1, "\u1E4B"], [7755, 2], [7756, 1, "\u1E4D"], [7757, 2], [7758, 1, "\u1E4F"], [7759, 2], [7760, 1, "\u1E51"], [7761, 2], [7762, 1, "\u1E53"], [7763, 2], [7764, 1, "\u1E55"], [7765, 2], [7766, 1, "\u1E57"], [7767, 2], [7768, 1, "\u1E59"], [7769, 2], [7770, 1, "\u1E5B"], [7771, 2], [7772, 1, "\u1E5D"], [7773, 2], [7774, 1, "\u1E5F"], [7775, 2], [7776, 1, "\u1E61"], [7777, 2], [7778, 1, "\u1E63"], [7779, 2], [7780, 1, "\u1E65"], [7781, 2], [7782, 1, "\u1E67"], [7783, 2], [7784, 1, "\u1E69"], [7785, 2], [7786, 1, "\u1E6B"], [7787, 2], [7788, 1, "\u1E6D"], [7789, 2], [7790, 1, "\u1E6F"], [7791, 2], [7792, 1, "\u1E71"], [7793, 2], [7794, 1, "\u1E73"], [7795, 2], [7796, 1, "\u1E75"], [7797, 2], [7798, 1, "\u1E77"], [7799, 2], [7800, 1, "\u1E79"], [7801, 2], [7802, 1, "\u1E7B"], [7803, 2], [7804, 1, "\u1E7D"], [7805, 2], [7806, 1, "\u1E7F"], [7807, 2], [7808, 1, "\u1E81"], [7809, 2], [7810, 1, "\u1E83"], [7811, 2], [7812, 1, "\u1E85"], [7813, 2], [7814, 1, "\u1E87"], [7815, 2], [7816, 1, "\u1E89"], [7817, 2], [7818, 1, "\u1E8B"], [7819, 2], [7820, 1, "\u1E8D"], [7821, 2], [7822, 1, "\u1E8F"], [7823, 2], [7824, 1, "\u1E91"], [7825, 2], [7826, 1, "\u1E93"], [7827, 2], [7828, 1, "\u1E95"], [[7829, 7833], 2], [7834, 1, "a\u02BE"], [7835, 1, "\u1E61"], [[7836, 7837], 2], [7838, 1, "ss"], [7839, 2], [7840, 1, "\u1EA1"], [7841, 2], [7842, 1, "\u1EA3"], [7843, 2], [7844, 1, "\u1EA5"], [7845, 2], [7846, 1, "\u1EA7"], [7847, 2], [7848, 1, "\u1EA9"], [7849, 2], [7850, 1, "\u1EAB"], [7851, 2], [7852, 1, "\u1EAD"], [7853, 2], [7854, 1, "\u1EAF"], [7855, 2], [7856, 1, "\u1EB1"], [7857, 2], [7858, 1, "\u1EB3"], [7859, 2], [7860, 1, "\u1EB5"], [7861, 2], [7862, 1, "\u1EB7"], [7863, 2], [7864, 1, "\u1EB9"], [7865, 2], [7866, 1, "\u1EBB"], [7867, 2], [7868, 1, "\u1EBD"], [7869, 2], [7870, 1, "\u1EBF"], [7871, 2], [7872, 1, "\u1EC1"], [7873, 2], [7874, 1, "\u1EC3"], [7875, 2], [7876, 1, "\u1EC5"], [7877, 2], [7878, 1, "\u1EC7"], [7879, 2], [7880, 1, "\u1EC9"], [7881, 2], [7882, 1, "\u1ECB"], [7883, 2], [7884, 1, "\u1ECD"], [7885, 2], [7886, 1, "\u1ECF"], [7887, 2], [7888, 1, "\u1ED1"], [7889, 2], [7890, 1, "\u1ED3"], [7891, 2], [7892, 1, "\u1ED5"], [7893, 2], [7894, 1, "\u1ED7"], [7895, 2], [7896, 1, "\u1ED9"], [7897, 2], [7898, 1, "\u1EDB"], [7899, 2], [7900, 1, "\u1EDD"], [7901, 2], [7902, 1, "\u1EDF"], [7903, 2], [7904, 1, "\u1EE1"], [7905, 2], [7906, 1, "\u1EE3"], [7907, 2], [7908, 1, "\u1EE5"], [7909, 2], [7910, 1, "\u1EE7"], [7911, 2], [7912, 1, "\u1EE9"], [7913, 2], [7914, 1, "\u1EEB"], [7915, 2], [7916, 1, "\u1EED"], [7917, 2], [7918, 1, "\u1EEF"], [7919, 2], [7920, 1, "\u1EF1"], [7921, 2], [7922, 1, "\u1EF3"], [7923, 2], [7924, 1, "\u1EF5"], [7925, 2], [7926, 1, "\u1EF7"], [7927, 2], [7928, 1, "\u1EF9"], [7929, 2], [7930, 1, "\u1EFB"], [7931, 2], [7932, 1, "\u1EFD"], [7933, 2], [7934, 1, "\u1EFF"], [7935, 2], [[7936, 7943], 2], [7944, 1, "\u1F00"], [7945, 1, "\u1F01"], [7946, 1, "\u1F02"], [7947, 1, "\u1F03"], [7948, 1, "\u1F04"], [7949, 1, "\u1F05"], [7950, 1, "\u1F06"], [7951, 1, "\u1F07"], [[7952, 7957], 2], [[7958, 7959], 3], [7960, 1, "\u1F10"], [7961, 1, "\u1F11"], [7962, 1, "\u1F12"], [7963, 1, "\u1F13"], [7964, 1, "\u1F14"], [7965, 1, "\u1F15"], [[7966, 7967], 3], [[7968, 7975], 2], [7976, 1, "\u1F20"], [7977, 1, "\u1F21"], [7978, 1, "\u1F22"], [7979, 1, "\u1F23"], [7980, 1, "\u1F24"], [7981, 1, "\u1F25"], [7982, 1, "\u1F26"], [7983, 1, "\u1F27"], [[7984, 7991], 2], [7992, 1, "\u1F30"], [7993, 1, "\u1F31"], [7994, 1, "\u1F32"], [7995, 1, "\u1F33"], [7996, 1, "\u1F34"], [7997, 1, "\u1F35"], [7998, 1, "\u1F36"], [7999, 1, "\u1F37"], [[8e3, 8005], 2], [[8006, 8007], 3], [8008, 1, "\u1F40"], [8009, 1, "\u1F41"], [8010, 1, "\u1F42"], [8011, 1, "\u1F43"], [8012, 1, "\u1F44"], [8013, 1, "\u1F45"], [[8014, 8015], 3], [[8016, 8023], 2], [8024, 3], [8025, 1, "\u1F51"], [8026, 3], [8027, 1, "\u1F53"], [8028, 3], [8029, 1, "\u1F55"], [8030, 3], [8031, 1, "\u1F57"], [[8032, 8039], 2], [8040, 1, "\u1F60"], [8041, 1, "\u1F61"], [8042, 1, "\u1F62"], [8043, 1, "\u1F63"], [8044, 1, "\u1F64"], [8045, 1, "\u1F65"], [8046, 1, "\u1F66"], [8047, 1, "\u1F67"], [8048, 2], [8049, 1, "\u03AC"], [8050, 2], [8051, 1, "\u03AD"], [8052, 2], [8053, 1, "\u03AE"], [8054, 2], [8055, 1, "\u03AF"], [8056, 2], [8057, 1, "\u03CC"], [8058, 2], [8059, 1, "\u03CD"], [8060, 2], [8061, 1, "\u03CE"], [[8062, 8063], 3], [8064, 1, "\u1F00\u03B9"], [8065, 1, "\u1F01\u03B9"], [8066, 1, "\u1F02\u03B9"], [8067, 1, "\u1F03\u03B9"], [8068, 1, "\u1F04\u03B9"], [8069, 1, "\u1F05\u03B9"], [8070, 1, "\u1F06\u03B9"], [8071, 1, "\u1F07\u03B9"], [8072, 1, "\u1F00\u03B9"], [8073, 1, "\u1F01\u03B9"], [8074, 1, "\u1F02\u03B9"], [8075, 1, "\u1F03\u03B9"], [8076, 1, "\u1F04\u03B9"], [8077, 1, "\u1F05\u03B9"], [8078, 1, "\u1F06\u03B9"], [8079, 1, "\u1F07\u03B9"], [8080, 1, "\u1F20\u03B9"], [8081, 1, "\u1F21\u03B9"], [8082, 1, "\u1F22\u03B9"], [8083, 1, "\u1F23\u03B9"], [8084, 1, "\u1F24\u03B9"], [8085, 1, "\u1F25\u03B9"], [8086, 1, "\u1F26\u03B9"], [8087, 1, "\u1F27\u03B9"], [8088, 1, "\u1F20\u03B9"], [8089, 1, "\u1F21\u03B9"], [8090, 1, "\u1F22\u03B9"], [8091, 1, "\u1F23\u03B9"], [8092, 1, "\u1F24\u03B9"], [8093, 1, "\u1F25\u03B9"], [8094, 1, "\u1F26\u03B9"], [8095, 1, "\u1F27\u03B9"], [8096, 1, "\u1F60\u03B9"], [8097, 1, "\u1F61\u03B9"], [8098, 1, "\u1F62\u03B9"], [8099, 1, "\u1F63\u03B9"], [8100, 1, "\u1F64\u03B9"], [8101, 1, "\u1F65\u03B9"], [8102, 1, "\u1F66\u03B9"], [8103, 1, "\u1F67\u03B9"], [8104, 1, "\u1F60\u03B9"], [8105, 1, "\u1F61\u03B9"], [8106, 1, "\u1F62\u03B9"], [8107, 1, "\u1F63\u03B9"], [8108, 1, "\u1F64\u03B9"], [8109, 1, "\u1F65\u03B9"], [8110, 1, "\u1F66\u03B9"], [8111, 1, "\u1F67\u03B9"], [[8112, 8113], 2], [8114, 1, "\u1F70\u03B9"], [8115, 1, "\u03B1\u03B9"], [8116, 1, "\u03AC\u03B9"], [8117, 3], [8118, 2], [8119, 1, "\u1FB6\u03B9"], [8120, 1, "\u1FB0"], [8121, 1, "\u1FB1"], [8122, 1, "\u1F70"], [8123, 1, "\u03AC"], [8124, 1, "\u03B1\u03B9"], [8125, 5, " \u0313"], [8126, 1, "\u03B9"], [8127, 5, " \u0313"], [8128, 5, " \u0342"], [8129, 5, " \u0308\u0342"], [8130, 1, "\u1F74\u03B9"], [8131, 1, "\u03B7\u03B9"], [8132, 1, "\u03AE\u03B9"], [8133, 3], [8134, 2], [8135, 1, "\u1FC6\u03B9"], [8136, 1, "\u1F72"], [8137, 1, "\u03AD"], [8138, 1, "\u1F74"], [8139, 1, "\u03AE"], [8140, 1, "\u03B7\u03B9"], [8141, 5, " \u0313\u0300"], [8142, 5, " \u0313\u0301"], [8143, 5, " \u0313\u0342"], [[8144, 8146], 2], [8147, 1, "\u0390"], [[8148, 8149], 3], [[8150, 8151], 2], [8152, 1, "\u1FD0"], [8153, 1, "\u1FD1"], [8154, 1, "\u1F76"], [8155, 1, "\u03AF"], [8156, 3], [8157, 5, " \u0314\u0300"], [8158, 5, " \u0314\u0301"], [8159, 5, " \u0314\u0342"], [[8160, 8162], 2], [8163, 1, "\u03B0"], [[8164, 8167], 2], [8168, 1, "\u1FE0"], [8169, 1, "\u1FE1"], [8170, 1, "\u1F7A"], [8171, 1, "\u03CD"], [8172, 1, "\u1FE5"], [8173, 5, " \u0308\u0300"], [8174, 5, " \u0308\u0301"], [8175, 5, "`"], [[8176, 8177], 3], [8178, 1, "\u1F7C\u03B9"], [8179, 1, "\u03C9\u03B9"], [8180, 1, "\u03CE\u03B9"], [8181, 3], [8182, 2], [8183, 1, "\u1FF6\u03B9"], [8184, 1, "\u1F78"], [8185, 1, "\u03CC"], [8186, 1, "\u1F7C"], [8187, 1, "\u03CE"], [8188, 1, "\u03C9\u03B9"], [8189, 5, " \u0301"], [8190, 5, " \u0314"], [8191, 3], [[8192, 8202], 5, " "], [8203, 7], [[8204, 8205], 6, ""], [[8206, 8207], 3], [8208, 2], [8209, 1, "\u2010"], [[8210, 8214], 2], [8215, 5, " \u0333"], [[8216, 8227], 2], [[8228, 8230], 3], [8231, 2], [[8232, 8238], 3], [8239, 5, " "], [[8240, 8242], 2], [8243, 1, "\u2032\u2032"], [8244, 1, "\u2032\u2032\u2032"], [8245, 2], [8246, 1, "\u2035\u2035"], [8247, 1, "\u2035\u2035\u2035"], [[8248, 8251], 2], [8252, 5, "!!"], [8253, 2], [8254, 5, " \u0305"], [[8255, 8262], 2], [8263, 5, "??"], [8264, 5, "?!"], [8265, 5, "!?"], [[8266, 8269], 2], [[8270, 8274], 2], [[8275, 8276], 2], [[8277, 8278], 2], [8279, 1, "\u2032\u2032\u2032\u2032"], [[8280, 8286], 2], [8287, 5, " "], [8288, 7], [[8289, 8291], 3], [8292, 7], [8293, 3], [[8294, 8297], 3], [[8298, 8303], 3], [8304, 1, "0"], [8305, 1, "i"], [[8306, 8307], 3], [8308, 1, "4"], [8309, 1, "5"], [8310, 1, "6"], [8311, 1, "7"], [8312, 1, "8"], [8313, 1, "9"], [8314, 5, "+"], [8315, 1, "\u2212"], [8316, 5, "="], [8317, 5, "("], [8318, 5, ")"], [8319, 1, "n"], [8320, 1, "0"], [8321, 1, "1"], [8322, 1, "2"], [8323, 1, "3"], [8324, 1, "4"], [8325, 1, "5"], [8326, 1, "6"], [8327, 1, "7"], [8328, 1, "8"], [8329, 1, "9"], [8330, 5, "+"], [8331, 1, "\u2212"], [8332, 5, "="], [8333, 5, "("], [8334, 5, ")"], [8335, 3], [8336, 1, "a"], [8337, 1, "e"], [8338, 1, "o"], [8339, 1, "x"], [8340, 1, "\u0259"], [8341, 1, "h"], [8342, 1, "k"], [8343, 1, "l"], [8344, 1, "m"], [8345, 1, "n"], [8346, 1, "p"], [8347, 1, "s"], [8348, 1, "t"], [[8349, 8351], 3], [[8352, 8359], 2], [8360, 1, "rs"], [[8361, 8362], 2], [8363, 2], [8364, 2], [[8365, 8367], 2], [[8368, 8369], 2], [[8370, 8373], 2], [[8374, 8376], 2], [8377, 2], [8378, 2], [[8379, 8381], 2], [8382, 2], [8383, 2], [8384, 2], [[8385, 8399], 3], [[8400, 8417], 2], [[8418, 8419], 2], [[8420, 8426], 2], [8427, 2], [[8428, 8431], 2], [8432, 2], [[8433, 8447], 3], [8448, 5, "a/c"], [8449, 5, "a/s"], [8450, 1, "c"], [8451, 1, "\xB0c"], [8452, 2], [8453, 5, "c/o"], [8454, 5, "c/u"], [8455, 1, "\u025B"], [8456, 2], [8457, 1, "\xB0f"], [8458, 1, "g"], [[8459, 8462], 1, "h"], [8463, 1, "\u0127"], [[8464, 8465], 1, "i"], [[8466, 8467], 1, "l"], [8468, 2], [8469, 1, "n"], [8470, 1, "no"], [[8471, 8472], 2], [8473, 1, "p"], [8474, 1, "q"], [[8475, 8477], 1, "r"], [[8478, 8479], 2], [8480, 1, "sm"], [8481, 1, "tel"], [8482, 1, "tm"], [8483, 2], [8484, 1, "z"], [8485, 2], [8486, 1, "\u03C9"], [8487, 2], [8488, 1, "z"], [8489, 2], [8490, 1, "k"], [8491, 1, "\xE5"], [8492, 1, "b"], [8493, 1, "c"], [8494, 2], [[8495, 8496], 1, "e"], [8497, 1, "f"], [8498, 3], [8499, 1, "m"], [8500, 1, "o"], [8501, 1, "\u05D0"], [8502, 1, "\u05D1"], [8503, 1, "\u05D2"], [8504, 1, "\u05D3"], [8505, 1, "i"], [8506, 2], [8507, 1, "fax"], [8508, 1, "\u03C0"], [[8509, 8510], 1, "\u03B3"], [8511, 1, "\u03C0"], [8512, 1, "\u2211"], [[8513, 8516], 2], [[8517, 8518], 1, "d"], [8519, 1, "e"], [8520, 1, "i"], [8521, 1, "j"], [[8522, 8523], 2], [8524, 2], [8525, 2], [8526, 2], [8527, 2], [8528, 1, "1\u20447"], [8529, 1, "1\u20449"], [8530, 1, "1\u204410"], [8531, 1, "1\u20443"], [8532, 1, "2\u20443"], [8533, 1, "1\u20445"], [8534, 1, "2\u20445"], [8535, 1, "3\u20445"], [8536, 1, "4\u20445"], [8537, 1, "1\u20446"], [8538, 1, "5\u20446"], [8539, 1, "1\u20448"], [8540, 1, "3\u20448"], [8541, 1, "5\u20448"], [8542, 1, "7\u20448"], [8543, 1, "1\u2044"], [8544, 1, "i"], [8545, 1, "ii"], [8546, 1, "iii"], [8547, 1, "iv"], [8548, 1, "v"], [8549, 1, "vi"], [8550, 1, "vii"], [8551, 1, "viii"], [8552, 1, "ix"], [8553, 1, "x"], [8554, 1, "xi"], [8555, 1, "xii"], [8556, 1, "l"], [8557, 1, "c"], [8558, 1, "d"], [8559, 1, "m"], [8560, 1, "i"], [8561, 1, "ii"], [8562, 1, "iii"], [8563, 1, "iv"], [8564, 1, "v"], [8565, 1, "vi"], [8566, 1, "vii"], [8567, 1, "viii"], [8568, 1, "ix"], [8569, 1, "x"], [8570, 1, "xi"], [8571, 1, "xii"], [8572, 1, "l"], [8573, 1, "c"], [8574, 1, "d"], [8575, 1, "m"], [[8576, 8578], 2], [8579, 3], [8580, 2], [[8581, 8584], 2], [8585, 1, "0\u20443"], [[8586, 8587], 2], [[8588, 8591], 3], [[8592, 8682], 2], [[8683, 8691], 2], [[8692, 8703], 2], [[8704, 8747], 2], [8748, 1, "\u222B\u222B"], [8749, 1, "\u222B\u222B\u222B"], [8750, 2], [8751, 1, "\u222E\u222E"], [8752, 1, "\u222E\u222E\u222E"], [[8753, 8799], 2], [8800, 4], [[8801, 8813], 2], [[8814, 8815], 4], [[8816, 8945], 2], [[8946, 8959], 2], [8960, 2], [8961, 2], [[8962, 9e3], 2], [9001, 1, "\u3008"], [9002, 1, "\u3009"], [[9003, 9082], 2], [9083, 2], [9084, 2], [[9085, 9114], 2], [[9115, 9166], 2], [[9167, 9168], 2], [[9169, 9179], 2], [[9180, 9191], 2], [9192, 2], [[9193, 9203], 2], [[9204, 9210], 2], [[9211, 9214], 2], [9215, 2], [[9216, 9252], 2], [[9253, 9254], 2], [[9255, 9279], 3], [[9280, 9290], 2], [[9291, 9311], 3], [9312, 1, "1"], [9313, 1, "2"], [9314, 1, "3"], [9315, 1, "4"], [9316, 1, "5"], [9317, 1, "6"], [9318, 1, "7"], [9319, 1, "8"], [9320, 1, "9"], [9321, 1, "10"], [9322, 1, "11"], [9323, 1, "12"], [9324, 1, "13"], [9325, 1, "14"], [9326, 1, "15"], [9327, 1, "16"], [9328, 1, "17"], [9329, 1, "18"], [9330, 1, "19"], [9331, 1, "20"], [9332, 5, "(1)"], [9333, 5, "(2)"], [9334, 5, "(3)"], [9335, 5, "(4)"], [9336, 5, "(5)"], [9337, 5, "(6)"], [9338, 5, "(7)"], [9339, 5, "(8)"], [9340, 5, "(9)"], [9341, 5, "(10)"], [9342, 5, "(11)"], [9343, 5, "(12)"], [9344, 5, "(13)"], [9345, 5, "(14)"], [9346, 5, "(15)"], [9347, 5, "(16)"], [9348, 5, "(17)"], [9349, 5, "(18)"], [9350, 5, "(19)"], [9351, 5, "(20)"], [[9352, 9371], 3], [9372, 5, "(a)"], [9373, 5, "(b)"], [9374, 5, "(c)"], [9375, 5, "(d)"], [9376, 5, "(e)"], [9377, 5, "(f)"], [9378, 5, "(g)"], [9379, 5, "(h)"], [9380, 5, "(i)"], [9381, 5, "(j)"], [9382, 5, "(k)"], [9383, 5, "(l)"], [9384, 5, "(m)"], [9385, 5, "(n)"], [9386, 5, "(o)"], [9387, 5, "(p)"], [9388, 5, "(q)"], [9389, 5, "(r)"], [9390, 5, "(s)"], [9391, 5, "(t)"], [9392, 5, "(u)"], [9393, 5, "(v)"], [9394, 5, "(w)"], [9395, 5, "(x)"], [9396, 5, "(y)"], [9397, 5, "(z)"], [9398, 1, "a"], [9399, 1, "b"], [9400, 1, "c"], [9401, 1, "d"], [9402, 1, "e"], [9403, 1, "f"], [9404, 1, "g"], [9405, 1, "h"], [9406, 1, "i"], [9407, 1, "j"], [9408, 1, "k"], [9409, 1, "l"], [9410, 1, "m"], [9411, 1, "n"], [9412, 1, "o"], [9413, 1, "p"], [9414, 1, "q"], [9415, 1, "r"], [9416, 1, "s"], [9417, 1, "t"], [9418, 1, "u"], [9419, 1, "v"], [9420, 1, "w"], [9421, 1, "x"], [9422, 1, "y"], [9423, 1, "z"], [9424, 1, "a"], [9425, 1, "b"], [9426, 1, "c"], [9427, 1, "d"], [9428, 1, "e"], [9429, 1, "f"], [9430, 1, "g"], [9431, 1, "h"], [9432, 1, "i"], [9433, 1, "j"], [9434, 1, "k"], [9435, 1, "l"], [9436, 1, "m"], [9437, 1, "n"], [9438, 1, "o"], [9439, 1, "p"], [9440, 1, "q"], [9441, 1, "r"], [9442, 1, "s"], [9443, 1, "t"], [9444, 1, "u"], [9445, 1, "v"], [9446, 1, "w"], [9447, 1, "x"], [9448, 1, "y"], [9449, 1, "z"], [9450, 1, "0"], [[9451, 9470], 2], [9471, 2], [[9472, 9621], 2], [[9622, 9631], 2], [[9632, 9711], 2], [[9712, 9719], 2], [[9720, 9727], 2], [[9728, 9747], 2], [[9748, 9749], 2], [[9750, 9751], 2], [9752, 2], [9753, 2], [[9754, 9839], 2], [[9840, 9841], 2], [[9842, 9853], 2], [[9854, 9855], 2], [[9856, 9865], 2], [[9866, 9873], 2], [[9874, 9884], 2], [9885, 2], [[9886, 9887], 2], [[9888, 9889], 2], [[9890, 9905], 2], [9906, 2], [[9907, 9916], 2], [[9917, 9919], 2], [[9920, 9923], 2], [[9924, 9933], 2], [9934, 2], [[9935, 9953], 2], [9954, 2], [9955, 2], [[9956, 9959], 2], [[9960, 9983], 2], [9984, 2], [[9985, 9988], 2], [9989, 2], [[9990, 9993], 2], [[9994, 9995], 2], [[9996, 10023], 2], [10024, 2], [[10025, 10059], 2], [10060, 2], [10061, 2], [10062, 2], [[10063, 10066], 2], [[10067, 10069], 2], [10070, 2], [10071, 2], [[10072, 10078], 2], [[10079, 10080], 2], [[10081, 10087], 2], [[10088, 10101], 2], [[10102, 10132], 2], [[10133, 10135], 2], [[10136, 10159], 2], [10160, 2], [[10161, 10174], 2], [10175, 2], [[10176, 10182], 2], [[10183, 10186], 2], [10187, 2], [10188, 2], [10189, 2], [[10190, 10191], 2], [[10192, 10219], 2], [[10220, 10223], 2], [[10224, 10239], 2], [[10240, 10495], 2], [[10496, 10763], 2], [10764, 1, "\u222B\u222B\u222B\u222B"], [[10765, 10867], 2], [10868, 5, "::="], [10869, 5, "=="], [10870, 5, "==="], [[10871, 10971], 2], [10972, 1, "\u2ADD\u0338"], [[10973, 11007], 2], [[11008, 11021], 2], [[11022, 11027], 2], [[11028, 11034], 2], [[11035, 11039], 2], [[11040, 11043], 2], [[11044, 11084], 2], [[11085, 11087], 2], [[11088, 11092], 2], [[11093, 11097], 2], [[11098, 11123], 2], [[11124, 11125], 3], [[11126, 11157], 2], [11158, 3], [11159, 2], [[11160, 11193], 2], [[11194, 11196], 2], [[11197, 11208], 2], [11209, 2], [[11210, 11217], 2], [11218, 2], [[11219, 11243], 2], [[11244, 11247], 2], [[11248, 11262], 2], [11263, 2], [11264, 1, "\u2C30"], [11265, 1, "\u2C31"], [11266, 1, "\u2C32"], [11267, 1, "\u2C33"], [11268, 1, "\u2C34"], [11269, 1, "\u2C35"], [11270, 1, "\u2C36"], [11271, 1, "\u2C37"], [11272, 1, "\u2C38"], [11273, 1, "\u2C39"], [11274, 1, "\u2C3A"], [11275, 1, "\u2C3B"], [11276, 1, "\u2C3C"], [11277, 1, "\u2C3D"], [11278, 1, "\u2C3E"], [11279, 1, "\u2C3F"], [11280, 1, "\u2C40"], [11281, 1, "\u2C41"], [11282, 1, "\u2C42"], [11283, 1, "\u2C43"], [11284, 1, "\u2C44"], [11285, 1, "\u2C45"], [11286, 1, "\u2C46"], [11287, 1, "\u2C47"], [11288, 1, "\u2C48"], [11289, 1, "\u2C49"], [11290, 1, "\u2C4A"], [11291, 1, "\u2C4B"], [11292, 1, "\u2C4C"], [11293, 1, "\u2C4D"], [11294, 1, "\u2C4E"], [11295, 1, "\u2C4F"], [11296, 1, "\u2C50"], [11297, 1, "\u2C51"], [11298, 1, "\u2C52"], [11299, 1, "\u2C53"], [11300, 1, "\u2C54"], [11301, 1, "\u2C55"], [11302, 1, "\u2C56"], [11303, 1, "\u2C57"], [11304, 1, "\u2C58"], [11305, 1, "\u2C59"], [11306, 1, "\u2C5A"], [11307, 1, "\u2C5B"], [11308, 1, "\u2C5C"], [11309, 1, "\u2C5D"], [11310, 1, "\u2C5E"], [11311, 1, "\u2C5F"], [[11312, 11358], 2], [11359, 2], [11360, 1, "\u2C61"], [11361, 2], [11362, 1, "\u026B"], [11363, 1, "\u1D7D"], [11364, 1, "\u027D"], [[11365, 11366], 2], [11367, 1, "\u2C68"], [11368, 2], [11369, 1, "\u2C6A"], [11370, 2], [11371, 1, "\u2C6C"], [11372, 2], [11373, 1, "\u0251"], [11374, 1, "\u0271"], [11375, 1, "\u0250"], [11376, 1, "\u0252"], [11377, 2], [11378, 1, "\u2C73"], [11379, 2], [11380, 2], [11381, 1, "\u2C76"], [[11382, 11383], 2], [[11384, 11387], 2], [11388, 1, "j"], [11389, 1, "v"], [11390, 1, "\u023F"], [11391, 1, "\u0240"], [11392, 1, "\u2C81"], [11393, 2], [11394, 1, "\u2C83"], [11395, 2], [11396, 1, "\u2C85"], [11397, 2], [11398, 1, "\u2C87"], [11399, 2], [11400, 1, "\u2C89"], [11401, 2], [11402, 1, "\u2C8B"], [11403, 2], [11404, 1, "\u2C8D"], [11405, 2], [11406, 1, "\u2C8F"], [11407, 2], [11408, 1, "\u2C91"], [11409, 2], [11410, 1, "\u2C93"], [11411, 2], [11412, 1, "\u2C95"], [11413, 2], [11414, 1, "\u2C97"], [11415, 2], [11416, 1, "\u2C99"], [11417, 2], [11418, 1, "\u2C9B"], [11419, 2], [11420, 1, "\u2C9D"], [11421, 2], [11422, 1, "\u2C9F"], [11423, 2], [11424, 1, "\u2CA1"], [11425, 2], [11426, 1, "\u2CA3"], [11427, 2], [11428, 1, "\u2CA5"], [11429, 2], [11430, 1, "\u2CA7"], [11431, 2], [11432, 1, "\u2CA9"], [11433, 2], [11434, 1, "\u2CAB"], [11435, 2], [11436, 1, "\u2CAD"], [11437, 2], [11438, 1, "\u2CAF"], [11439, 2], [11440, 1, "\u2CB1"], [11441, 2], [11442, 1, "\u2CB3"], [11443, 2], [11444, 1, "\u2CB5"], [11445, 2], [11446, 1, "\u2CB7"], [11447, 2], [11448, 1, "\u2CB9"], [11449, 2], [11450, 1, "\u2CBB"], [11451, 2], [11452, 1, "\u2CBD"], [11453, 2], [11454, 1, "\u2CBF"], [11455, 2], [11456, 1, "\u2CC1"], [11457, 2], [11458, 1, "\u2CC3"], [11459, 2], [11460, 1, "\u2CC5"], [11461, 2], [11462, 1, "\u2CC7"], [11463, 2], [11464, 1, "\u2CC9"], [11465, 2], [11466, 1, "\u2CCB"], [11467, 2], [11468, 1, "\u2CCD"], [11469, 2], [11470, 1, "\u2CCF"], [11471, 2], [11472, 1, "\u2CD1"], [11473, 2], [11474, 1, "\u2CD3"], [11475, 2], [11476, 1, "\u2CD5"], [11477, 2], [11478, 1, "\u2CD7"], [11479, 2], [11480, 1, "\u2CD9"], [11481, 2], [11482, 1, "\u2CDB"], [11483, 2], [11484, 1, "\u2CDD"], [11485, 2], [11486, 1, "\u2CDF"], [11487, 2], [11488, 1, "\u2CE1"], [11489, 2], [11490, 1, "\u2CE3"], [[11491, 11492], 2], [[11493, 11498], 2], [11499, 1, "\u2CEC"], [11500, 2], [11501, 1, "\u2CEE"], [[11502, 11505], 2], [11506, 1, "\u2CF3"], [11507, 2], [[11508, 11512], 3], [[11513, 11519], 2], [[11520, 11557], 2], [11558, 3], [11559, 2], [[11560, 11564], 3], [11565, 2], [[11566, 11567], 3], [[11568, 11621], 2], [[11622, 11623], 2], [[11624, 11630], 3], [11631, 1, "\u2D61"], [11632, 2], [[11633, 11646], 3], [11647, 2], [[11648, 11670], 2], [[11671, 11679], 3], [[11680, 11686], 2], [11687, 3], [[11688, 11694], 2], [11695, 3], [[11696, 11702], 2], [11703, 3], [[11704, 11710], 2], [11711, 3], [[11712, 11718], 2], [11719, 3], [[11720, 11726], 2], [11727, 3], [[11728, 11734], 2], [11735, 3], [[11736, 11742], 2], [11743, 3], [[11744, 11775], 2], [[11776, 11799], 2], [[11800, 11803], 2], [[11804, 11805], 2], [[11806, 11822], 2], [11823, 2], [11824, 2], [11825, 2], [[11826, 11835], 2], [[11836, 11842], 2], [[11843, 11844], 2], [[11845, 11849], 2], [[11850, 11854], 2], [11855, 2], [[11856, 11858], 2], [[11859, 11869], 2], [[11870, 11903], 3], [[11904, 11929], 2], [11930, 3], [[11931, 11934], 2], [11935, 1, "\u6BCD"], [[11936, 12018], 2], [12019, 1, "\u9F9F"], [[12020, 12031], 3], [12032, 1, "\u4E00"], [12033, 1, "\u4E28"], [12034, 1, "\u4E36"], [12035, 1, "\u4E3F"], [12036, 1, "\u4E59"], [12037, 1, "\u4E85"], [12038, 1, "\u4E8C"], [12039, 1, "\u4EA0"], [12040, 1, "\u4EBA"], [12041, 1, "\u513F"], [12042, 1, "\u5165"], [12043, 1, "\u516B"], [12044, 1, "\u5182"], [12045, 1, "\u5196"], [12046, 1, "\u51AB"], [12047, 1, "\u51E0"], [12048, 1, "\u51F5"], [12049, 1, "\u5200"], [12050, 1, "\u529B"], [12051, 1, "\u52F9"], [12052, 1, "\u5315"], [12053, 1, "\u531A"], [12054, 1, "\u5338"], [12055, 1, "\u5341"], [12056, 1, "\u535C"], [12057, 1, "\u5369"], [12058, 1, "\u5382"], [12059, 1, "\u53B6"], [12060, 1, "\u53C8"], [12061, 1, "\u53E3"], [12062, 1, "\u56D7"], [12063, 1, "\u571F"], [12064, 1, "\u58EB"], [12065, 1, "\u5902"], [12066, 1, "\u590A"], [12067, 1, "\u5915"], [12068, 1, "\u5927"], [12069, 1, "\u5973"], [12070, 1, "\u5B50"], [12071, 1, "\u5B80"], [12072, 1, "\u5BF8"], [12073, 1, "\u5C0F"], [12074, 1, "\u5C22"], [12075, 1, "\u5C38"], [12076, 1, "\u5C6E"], [12077, 1, "\u5C71"], [12078, 1, "\u5DDB"], [12079, 1, "\u5DE5"], [12080, 1, "\u5DF1"], [12081, 1, "\u5DFE"], [12082, 1, "\u5E72"], [12083, 1, "\u5E7A"], [12084, 1, "\u5E7F"], [12085, 1, "\u5EF4"], [12086, 1, "\u5EFE"], [12087, 1, "\u5F0B"], [12088, 1, "\u5F13"], [12089, 1, "\u5F50"], [12090, 1, "\u5F61"], [12091, 1, "\u5F73"], [12092, 1, "\u5FC3"], [12093, 1, "\u6208"], [12094, 1, "\u6236"], [12095, 1, "\u624B"], [12096, 1, "\u652F"], [12097, 1, "\u6534"], [12098, 1, "\u6587"], [12099, 1, "\u6597"], [12100, 1, "\u65A4"], [12101, 1, "\u65B9"], [12102, 1, "\u65E0"], [12103, 1, "\u65E5"], [12104, 1, "\u66F0"], [12105, 1, "\u6708"], [12106, 1, "\u6728"], [12107, 1, "\u6B20"], [12108, 1, "\u6B62"], [12109, 1, "\u6B79"], [12110, 1, "\u6BB3"], [12111, 1, "\u6BCB"], [12112, 1, "\u6BD4"], [12113, 1, "\u6BDB"], [12114, 1, "\u6C0F"], [12115, 1, "\u6C14"], [12116, 1, "\u6C34"], [12117, 1, "\u706B"], [12118, 1, "\u722A"], [12119, 1, "\u7236"], [12120, 1, "\u723B"], [12121, 1, "\u723F"], [12122, 1, "\u7247"], [12123, 1, "\u7259"], [12124, 1, "\u725B"], [12125, 1, "\u72AC"], [12126, 1, "\u7384"], [12127, 1, "\u7389"], [12128, 1, "\u74DC"], [12129, 1, "\u74E6"], [12130, 1, "\u7518"], [12131, 1, "\u751F"], [12132, 1, "\u7528"], [12133, 1, "\u7530"], [12134, 1, "\u758B"], [12135, 1, "\u7592"], [12136, 1, "\u7676"], [12137, 1, "\u767D"], [12138, 1, "\u76AE"], [12139, 1, "\u76BF"], [12140, 1, "\u76EE"], [12141, 1, "\u77DB"], [12142, 1, "\u77E2"], [12143, 1, "\u77F3"], [12144, 1, "\u793A"], [12145, 1, "\u79B8"], [12146, 1, "\u79BE"], [12147, 1, "\u7A74"], [12148, 1, "\u7ACB"], [12149, 1, "\u7AF9"], [12150, 1, "\u7C73"], [12151, 1, "\u7CF8"], [12152, 1, "\u7F36"], [12153, 1, "\u7F51"], [12154, 1, "\u7F8A"], [12155, 1, "\u7FBD"], [12156, 1, "\u8001"], [12157, 1, "\u800C"], [12158, 1, "\u8012"], [12159, 1, "\u8033"], [12160, 1, "\u807F"], [12161, 1, "\u8089"], [12162, 1, "\u81E3"], [12163, 1, "\u81EA"], [12164, 1, "\u81F3"], [12165, 1, "\u81FC"], [12166, 1, "\u820C"], [12167, 1, "\u821B"], [12168, 1, "\u821F"], [12169, 1, "\u826E"], [12170, 1, "\u8272"], [12171, 1, "\u8278"], [12172, 1, "\u864D"], [12173, 1, "\u866B"], [12174, 1, "\u8840"], [12175, 1, "\u884C"], [12176, 1, "\u8863"], [12177, 1, "\u897E"], [12178, 1, "\u898B"], [12179, 1, "\u89D2"], [12180, 1, "\u8A00"], [12181, 1, "\u8C37"], [12182, 1, "\u8C46"], [12183, 1, "\u8C55"], [12184, 1, "\u8C78"], [12185, 1, "\u8C9D"], [12186, 1, "\u8D64"], [12187, 1, "\u8D70"], [12188, 1, "\u8DB3"], [12189, 1, "\u8EAB"], [12190, 1, "\u8ECA"], [12191, 1, "\u8F9B"], [12192, 1, "\u8FB0"], [12193, 1, "\u8FB5"], [12194, 1, "\u9091"], [12195, 1, "\u9149"], [12196, 1, "\u91C6"], [12197, 1, "\u91CC"], [12198, 1, "\u91D1"], [12199, 1, "\u9577"], [12200, 1, "\u9580"], [12201, 1, "\u961C"], [12202, 1, "\u96B6"], [12203, 1, "\u96B9"], [12204, 1, "\u96E8"], [12205, 1, "\u9751"], [12206, 1, "\u975E"], [12207, 1, "\u9762"], [12208, 1, "\u9769"], [12209, 1, "\u97CB"], [12210, 1, "\u97ED"], [12211, 1, "\u97F3"], [12212, 1, "\u9801"], [12213, 1, "\u98A8"], [12214, 1, "\u98DB"], [12215, 1, "\u98DF"], [12216, 1, "\u9996"], [12217, 1, "\u9999"], [12218, 1, "\u99AC"], [12219, 1, "\u9AA8"], [12220, 1, "\u9AD8"], [12221, 1, "\u9ADF"], [12222, 1, "\u9B25"], [12223, 1, "\u9B2F"], [12224, 1, "\u9B32"], [12225, 1, "\u9B3C"], [12226, 1, "\u9B5A"], [12227, 1, "\u9CE5"], [12228, 1, "\u9E75"], [12229, 1, "\u9E7F"], [12230, 1, "\u9EA5"], [12231, 1, "\u9EBB"], [12232, 1, "\u9EC3"], [12233, 1, "\u9ECD"], [12234, 1, "\u9ED1"], [12235, 1, "\u9EF9"], [12236, 1, "\u9EFD"], [12237, 1, "\u9F0E"], [12238, 1, "\u9F13"], [12239, 1, "\u9F20"], [12240, 1, "\u9F3B"], [12241, 1, "\u9F4A"], [12242, 1, "\u9F52"], [12243, 1, "\u9F8D"], [12244, 1, "\u9F9C"], [12245, 1, "\u9FA0"], [[12246, 12271], 3], [[12272, 12283], 3], [[12284, 12287], 3], [12288, 5, " "], [12289, 2], [12290, 1, "."], [[12291, 12292], 2], [[12293, 12295], 2], [[12296, 12329], 2], [[12330, 12333], 2], [[12334, 12341], 2], [12342, 1, "\u3012"], [12343, 2], [12344, 1, "\u5341"], [12345, 1, "\u5344"], [12346, 1, "\u5345"], [12347, 2], [12348, 2], [12349, 2], [12350, 2], [12351, 2], [12352, 3], [[12353, 12436], 2], [[12437, 12438], 2], [[12439, 12440], 3], [[12441, 12442], 2], [12443, 5, " \u3099"], [12444, 5, " \u309A"], [[12445, 12446], 2], [12447, 1, "\u3088\u308A"], [12448, 2], [[12449, 12542], 2], [12543, 1, "\u30B3\u30C8"], [[12544, 12548], 3], [[12549, 12588], 2], [12589, 2], [12590, 2], [12591, 2], [12592, 3], [12593, 1, "\u1100"], [12594, 1, "\u1101"], [12595, 1, "\u11AA"], [12596, 1, "\u1102"], [12597, 1, "\u11AC"], [12598, 1, "\u11AD"], [12599, 1, "\u1103"], [12600, 1, "\u1104"], [12601, 1, "\u1105"], [12602, 1, "\u11B0"], [12603, 1, "\u11B1"], [12604, 1, "\u11B2"], [12605, 1, "\u11B3"], [12606, 1, "\u11B4"], [12607, 1, "\u11B5"], [12608, 1, "\u111A"], [12609, 1, "\u1106"], [12610, 1, "\u1107"], [12611, 1, "\u1108"], [12612, 1, "\u1121"], [12613, 1, "\u1109"], [12614, 1, "\u110A"], [12615, 1, "\u110B"], [12616, 1, "\u110C"], [12617, 1, "\u110D"], [12618, 1, "\u110E"], [12619, 1, "\u110F"], [12620, 1, "\u1110"], [12621, 1, "\u1111"], [12622, 1, "\u1112"], [12623, 1, "\u1161"], [12624, 1, "\u1162"], [12625, 1, "\u1163"], [12626, 1, "\u1164"], [12627, 1, "\u1165"], [12628, 1, "\u1166"], [12629, 1, "\u1167"], [12630, 1, "\u1168"], [12631, 1, "\u1169"], [12632, 1, "\u116A"], [12633, 1, "\u116B"], [12634, 1, "\u116C"], [12635, 1, "\u116D"], [12636, 1, "\u116E"], [12637, 1, "\u116F"], [12638, 1, "\u1170"], [12639, 1, "\u1171"], [12640, 1, "\u1172"], [12641, 1, "\u1173"], [12642, 1, "\u1174"], [12643, 1, "\u1175"], [12644, 3], [12645, 1, "\u1114"], [12646, 1, "\u1115"], [12647, 1, "\u11C7"], [12648, 1, "\u11C8"], [12649, 1, "\u11CC"], [12650, 1, "\u11CE"], [12651, 1, "\u11D3"], [12652, 1, "\u11D7"], [12653, 1, "\u11D9"], [12654, 1, "\u111C"], [12655, 1, "\u11DD"], [12656, 1, "\u11DF"], [12657, 1, "\u111D"], [12658, 1, "\u111E"], [12659, 1, "\u1120"], [12660, 1, "\u1122"], [12661, 1, "\u1123"], [12662, 1, "\u1127"], [12663, 1, "\u1129"], [12664, 1, "\u112B"], [12665, 1, "\u112C"], [12666, 1, "\u112D"], [12667, 1, "\u112E"], [12668, 1, "\u112F"], [12669, 1, "\u1132"], [12670, 1, "\u1136"], [12671, 1, "\u1140"], [12672, 1, "\u1147"], [12673, 1, "\u114C"], [12674, 1, "\u11F1"], [12675, 1, "\u11F2"], [12676, 1, "\u1157"], [12677, 1, "\u1158"], [12678, 1, "\u1159"], [12679, 1, "\u1184"], [12680, 1, "\u1185"], [12681, 1, "\u1188"], [12682, 1, "\u1191"], [12683, 1, "\u1192"], [12684, 1, "\u1194"], [12685, 1, "\u119E"], [12686, 1, "\u11A1"], [12687, 3], [[12688, 12689], 2], [12690, 1, "\u4E00"], [12691, 1, "\u4E8C"], [12692, 1, "\u4E09"], [12693, 1, "\u56DB"], [12694, 1, "\u4E0A"], [12695, 1, "\u4E2D"], [12696, 1, "\u4E0B"], [12697, 1, "\u7532"], [12698, 1, "\u4E59"], [12699, 1, "\u4E19"], [12700, 1, "\u4E01"], [12701, 1, "\u5929"], [12702, 1, "\u5730"], [12703, 1, "\u4EBA"], [[12704, 12727], 2], [[12728, 12730], 2], [[12731, 12735], 2], [[12736, 12751], 2], [[12752, 12771], 2], [[12772, 12783], 3], [[12784, 12799], 2], [12800, 5, "(\u1100)"], [12801, 5, "(\u1102)"], [12802, 5, "(\u1103)"], [12803, 5, "(\u1105)"], [12804, 5, "(\u1106)"], [12805, 5, "(\u1107)"], [12806, 5, "(\u1109)"], [12807, 5, "(\u110B)"], [12808, 5, "(\u110C)"], [12809, 5, "(\u110E)"], [12810, 5, "(\u110F)"], [12811, 5, "(\u1110)"], [12812, 5, "(\u1111)"], [12813, 5, "(\u1112)"], [12814, 5, "(\uAC00)"], [12815, 5, "(\uB098)"], [12816, 5, "(\uB2E4)"], [12817, 5, "(\uB77C)"], [12818, 5, "(\uB9C8)"], [12819, 5, "(\uBC14)"], [12820, 5, "(\uC0AC)"], [12821, 5, "(\uC544)"], [12822, 5, "(\uC790)"], [12823, 5, "(\uCC28)"], [12824, 5, "(\uCE74)"], [12825, 5, "(\uD0C0)"], [12826, 5, "(\uD30C)"], [12827, 5, "(\uD558)"], [12828, 5, "(\uC8FC)"], [12829, 5, "(\uC624\uC804)"], [12830, 5, "(\uC624\uD6C4)"], [12831, 3], [12832, 5, "(\u4E00)"], [12833, 5, "(\u4E8C)"], [12834, 5, "(\u4E09)"], [12835, 5, "(\u56DB)"], [12836, 5, "(\u4E94)"], [12837, 5, "(\u516D)"], [12838, 5, "(\u4E03)"], [12839, 5, "(\u516B)"], [12840, 5, "(\u4E5D)"], [12841, 5, "(\u5341)"], [12842, 5, "(\u6708)"], [12843, 5, "(\u706B)"], [12844, 5, "(\u6C34)"], [12845, 5, "(\u6728)"], [12846, 5, "(\u91D1)"], [12847, 5, "(\u571F)"], [12848, 5, "(\u65E5)"], [12849, 5, "(\u682A)"], [12850, 5, "(\u6709)"], [12851, 5, "(\u793E)"], [12852, 5, "(\u540D)"], [12853, 5, "(\u7279)"], [12854, 5, "(\u8CA1)"], [12855, 5, "(\u795D)"], [12856, 5, "(\u52B4)"], [12857, 5, "(\u4EE3)"], [12858, 5, "(\u547C)"], [12859, 5, "(\u5B66)"], [12860, 5, "(\u76E3)"], [12861, 5, "(\u4F01)"], [12862, 5, "(\u8CC7)"], [12863, 5, "(\u5354)"], [12864, 5, "(\u796D)"], [12865, 5, "(\u4F11)"], [12866, 5, "(\u81EA)"], [12867, 5, "(\u81F3)"], [12868, 1, "\u554F"], [12869, 1, "\u5E7C"], [12870, 1, "\u6587"], [12871, 1, "\u7B8F"], [[12872, 12879], 2], [12880, 1, "pte"], [12881, 1, "21"], [12882, 1, "22"], [12883, 1, "23"], [12884, 1, "24"], [12885, 1, "25"], [12886, 1, "26"], [12887, 1, "27"], [12888, 1, "28"], [12889, 1, "29"], [12890, 1, "30"], [12891, 1, "31"], [12892, 1, "32"], [12893, 1, "33"], [12894, 1, "34"], [12895, 1, "35"], [12896, 1, "\u1100"], [12897, 1, "\u1102"], [12898, 1, "\u1103"], [12899, 1, "\u1105"], [12900, 1, "\u1106"], [12901, 1, "\u1107"], [12902, 1, "\u1109"], [12903, 1, "\u110B"], [12904, 1, "\u110C"], [12905, 1, "\u110E"], [12906, 1, "\u110F"], [12907, 1, "\u1110"], [12908, 1, "\u1111"], [12909, 1, "\u1112"], [12910, 1, "\uAC00"], [12911, 1, "\uB098"], [12912, 1, "\uB2E4"], [12913, 1, "\uB77C"], [12914, 1, "\uB9C8"], [12915, 1, "\uBC14"], [12916, 1, "\uC0AC"], [12917, 1, "\uC544"], [12918, 1, "\uC790"], [12919, 1, "\uCC28"], [12920, 1, "\uCE74"], [12921, 1, "\uD0C0"], [12922, 1, "\uD30C"], [12923, 1, "\uD558"], [12924, 1, "\uCC38\uACE0"], [12925, 1, "\uC8FC\uC758"], [12926, 1, "\uC6B0"], [12927, 2], [12928, 1, "\u4E00"], [12929, 1, "\u4E8C"], [12930, 1, "\u4E09"], [12931, 1, "\u56DB"], [12932, 1, "\u4E94"], [12933, 1, "\u516D"], [12934, 1, "\u4E03"], [12935, 1, "\u516B"], [12936, 1, "\u4E5D"], [12937, 1, "\u5341"], [12938, 1, "\u6708"], [12939, 1, "\u706B"], [12940, 1, "\u6C34"], [12941, 1, "\u6728"], [12942, 1, "\u91D1"], [12943, 1, "\u571F"], [12944, 1, "\u65E5"], [12945, 1, "\u682A"], [12946, 1, "\u6709"], [12947, 1, "\u793E"], [12948, 1, "\u540D"], [12949, 1, "\u7279"], [12950, 1, "\u8CA1"], [12951, 1, "\u795D"], [12952, 1, "\u52B4"], [12953, 1, "\u79D8"], [12954, 1, "\u7537"], [12955, 1, "\u5973"], [12956, 1, "\u9069"], [12957, 1, "\u512A"], [12958, 1, "\u5370"], [12959, 1, "\u6CE8"], [12960, 1, "\u9805"], [12961, 1, "\u4F11"], [12962, 1, "\u5199"], [12963, 1, "\u6B63"], [12964, 1, "\u4E0A"], [12965, 1, "\u4E2D"], [12966, 1, "\u4E0B"], [12967, 1, "\u5DE6"], [12968, 1, "\u53F3"], [12969, 1, "\u533B"], [12970, 1, "\u5B97"], [12971, 1, "\u5B66"], [12972, 1, "\u76E3"], [12973, 1, "\u4F01"], [12974, 1, "\u8CC7"], [12975, 1, "\u5354"], [12976, 1, "\u591C"], [12977, 1, "36"], [12978, 1, "37"], [12979, 1, "38"], [12980, 1, "39"], [12981, 1, "40"], [12982, 1, "41"], [12983, 1, "42"], [12984, 1, "43"], [12985, 1, "44"], [12986, 1, "45"], [12987, 1, "46"], [12988, 1, "47"], [12989, 1, "48"], [12990, 1, "49"], [12991, 1, "50"], [12992, 1, "1\u6708"], [12993, 1, "2\u6708"], [12994, 1, "3\u6708"], [12995, 1, "4\u6708"], [12996, 1, "5\u6708"], [12997, 1, "6\u6708"], [12998, 1, "7\u6708"], [12999, 1, "8\u6708"], [13e3, 1, "9\u6708"], [13001, 1, "10\u6708"], [13002, 1, "11\u6708"], [13003, 1, "12\u6708"], [13004, 1, "hg"], [13005, 1, "erg"], [13006, 1, "ev"], [13007, 1, "ltd"], [13008, 1, "\u30A2"], [13009, 1, "\u30A4"], [13010, 1, "\u30A6"], [13011, 1, "\u30A8"], [13012, 1, "\u30AA"], [13013, 1, "\u30AB"], [13014, 1, "\u30AD"], [13015, 1, "\u30AF"], [13016, 1, "\u30B1"], [13017, 1, "\u30B3"], [13018, 1, "\u30B5"], [13019, 1, "\u30B7"], [13020, 1, "\u30B9"], [13021, 1, "\u30BB"], [13022, 1, "\u30BD"], [13023, 1, "\u30BF"], [13024, 1, "\u30C1"], [13025, 1, "\u30C4"], [13026, 1, "\u30C6"], [13027, 1, "\u30C8"], [13028, 1, "\u30CA"], [13029, 1, "\u30CB"], [13030, 1, "\u30CC"], [13031, 1, "\u30CD"], [13032, 1, "\u30CE"], [13033, 1, "\u30CF"], [13034, 1, "\u30D2"], [13035, 1, "\u30D5"], [13036, 1, "\u30D8"], [13037, 1, "\u30DB"], [13038, 1, "\u30DE"], [13039, 1, "\u30DF"], [13040, 1, "\u30E0"], [13041, 1, "\u30E1"], [13042, 1, "\u30E2"], [13043, 1, "\u30E4"], [13044, 1, "\u30E6"], [13045, 1, "\u30E8"], [13046, 1, "\u30E9"], [13047, 1, "\u30EA"], [13048, 1, "\u30EB"], [13049, 1, "\u30EC"], [13050, 1, "\u30ED"], [13051, 1, "\u30EF"], [13052, 1, "\u30F0"], [13053, 1, "\u30F1"], [13054, 1, "\u30F2"], [13055, 1, "\u4EE4\u548C"], [13056, 1, "\u30A2\u30D1\u30FC\u30C8"], [13057, 1, "\u30A2\u30EB\u30D5\u30A1"], [13058, 1, "\u30A2\u30F3\u30DA\u30A2"], [13059, 1, "\u30A2\u30FC\u30EB"], [13060, 1, "\u30A4\u30CB\u30F3\u30B0"], [13061, 1, "\u30A4\u30F3\u30C1"], [13062, 1, "\u30A6\u30A9\u30F3"], [13063, 1, "\u30A8\u30B9\u30AF\u30FC\u30C9"], [13064, 1, "\u30A8\u30FC\u30AB\u30FC"], [13065, 1, "\u30AA\u30F3\u30B9"], [13066, 1, "\u30AA\u30FC\u30E0"], [13067, 1, "\u30AB\u30A4\u30EA"], [13068, 1, "\u30AB\u30E9\u30C3\u30C8"], [13069, 1, "\u30AB\u30ED\u30EA\u30FC"], [13070, 1, "\u30AC\u30ED\u30F3"], [13071, 1, "\u30AC\u30F3\u30DE"], [13072, 1, "\u30AE\u30AC"], [13073, 1, "\u30AE\u30CB\u30FC"], [13074, 1, "\u30AD\u30E5\u30EA\u30FC"], [13075, 1, "\u30AE\u30EB\u30C0\u30FC"], [13076, 1, "\u30AD\u30ED"], [13077, 1, "\u30AD\u30ED\u30B0\u30E9\u30E0"], [13078, 1, "\u30AD\u30ED\u30E1\u30FC\u30C8\u30EB"], [13079, 1, "\u30AD\u30ED\u30EF\u30C3\u30C8"], [13080, 1, "\u30B0\u30E9\u30E0"], [13081, 1, "\u30B0\u30E9\u30E0\u30C8\u30F3"], [13082, 1, "\u30AF\u30EB\u30BC\u30A4\u30ED"], [13083, 1, "\u30AF\u30ED\u30FC\u30CD"], [13084, 1, "\u30B1\u30FC\u30B9"], [13085, 1, "\u30B3\u30EB\u30CA"], [13086, 1, "\u30B3\u30FC\u30DD"], [13087, 1, "\u30B5\u30A4\u30AF\u30EB"], [13088, 1, "\u30B5\u30F3\u30C1\u30FC\u30E0"], [13089, 1, "\u30B7\u30EA\u30F3\u30B0"], [13090, 1, "\u30BB\u30F3\u30C1"], [13091, 1, "\u30BB\u30F3\u30C8"], [13092, 1, "\u30C0\u30FC\u30B9"], [13093, 1, "\u30C7\u30B7"], [13094, 1, "\u30C9\u30EB"], [13095, 1, "\u30C8\u30F3"], [13096, 1, "\u30CA\u30CE"], [13097, 1, "\u30CE\u30C3\u30C8"], [13098, 1, "\u30CF\u30A4\u30C4"], [13099, 1, "\u30D1\u30FC\u30BB\u30F3\u30C8"], [13100, 1, "\u30D1\u30FC\u30C4"], [13101, 1, "\u30D0\u30FC\u30EC\u30EB"], [13102, 1, "\u30D4\u30A2\u30B9\u30C8\u30EB"], [13103, 1, "\u30D4\u30AF\u30EB"], [13104, 1, "\u30D4\u30B3"], [13105, 1, "\u30D3\u30EB"], [13106, 1, "\u30D5\u30A1\u30E9\u30C3\u30C9"], [13107, 1, "\u30D5\u30A3\u30FC\u30C8"], [13108, 1, "\u30D6\u30C3\u30B7\u30A7\u30EB"], [13109, 1, "\u30D5\u30E9\u30F3"], [13110, 1, "\u30D8\u30AF\u30BF\u30FC\u30EB"], [13111, 1, "\u30DA\u30BD"], [13112, 1, "\u30DA\u30CB\u30D2"], [13113, 1, "\u30D8\u30EB\u30C4"], [13114, 1, "\u30DA\u30F3\u30B9"], [13115, 1, "\u30DA\u30FC\u30B8"], [13116, 1, "\u30D9\u30FC\u30BF"], [13117, 1, "\u30DD\u30A4\u30F3\u30C8"], [13118, 1, "\u30DC\u30EB\u30C8"], [13119, 1, "\u30DB\u30F3"], [13120, 1, "\u30DD\u30F3\u30C9"], [13121, 1, "\u30DB\u30FC\u30EB"], [13122, 1, "\u30DB\u30FC\u30F3"], [13123, 1, "\u30DE\u30A4\u30AF\u30ED"], [13124, 1, "\u30DE\u30A4\u30EB"], [13125, 1, "\u30DE\u30C3\u30CF"], [13126, 1, "\u30DE\u30EB\u30AF"], [13127, 1, "\u30DE\u30F3\u30B7\u30E7\u30F3"], [13128, 1, "\u30DF\u30AF\u30ED\u30F3"], [13129, 1, "\u30DF\u30EA"], [13130, 1, "\u30DF\u30EA\u30D0\u30FC\u30EB"], [13131, 1, "\u30E1\u30AC"], [13132, 1, "\u30E1\u30AC\u30C8\u30F3"], [13133, 1, "\u30E1\u30FC\u30C8\u30EB"], [13134, 1, "\u30E4\u30FC\u30C9"], [13135, 1, "\u30E4\u30FC\u30EB"], [13136, 1, "\u30E6\u30A2\u30F3"], [13137, 1, "\u30EA\u30C3\u30C8\u30EB"], [13138, 1, "\u30EA\u30E9"], [13139, 1, "\u30EB\u30D4\u30FC"], [13140, 1, "\u30EB\u30FC\u30D6\u30EB"], [13141, 1, "\u30EC\u30E0"], [13142, 1, "\u30EC\u30F3\u30C8\u30B2\u30F3"], [13143, 1, "\u30EF\u30C3\u30C8"], [13144, 1, "0\u70B9"], [13145, 1, "1\u70B9"], [13146, 1, "2\u70B9"], [13147, 1, "3\u70B9"], [13148, 1, "4\u70B9"], [13149, 1, "5\u70B9"], [13150, 1, "6\u70B9"], [13151, 1, "7\u70B9"], [13152, 1, "8\u70B9"], [13153, 1, "9\u70B9"], [13154, 1, "10\u70B9"], [13155, 1, "11\u70B9"], [13156, 1, "12\u70B9"], [13157, 1, "13\u70B9"], [13158, 1, "14\u70B9"], [13159, 1, "15\u70B9"], [13160, 1, "16\u70B9"], [13161, 1, "17\u70B9"], [13162, 1, "18\u70B9"], [13163, 1, "19\u70B9"], [13164, 1, "20\u70B9"], [13165, 1, "21\u70B9"], [13166, 1, "22\u70B9"], [13167, 1, "23\u70B9"], [13168, 1, "24\u70B9"], [13169, 1, "hpa"], [13170, 1, "da"], [13171, 1, "au"], [13172, 1, "bar"], [13173, 1, "ov"], [13174, 1, "pc"], [13175, 1, "dm"], [13176, 1, "dm2"], [13177, 1, "dm3"], [13178, 1, "iu"], [13179, 1, "\u5E73\u6210"], [13180, 1, "\u662D\u548C"], [13181, 1, "\u5927\u6B63"], [13182, 1, "\u660E\u6CBB"], [13183, 1, "\u682A\u5F0F\u4F1A\u793E"], [13184, 1, "pa"], [13185, 1, "na"], [13186, 1, "\u03BCa"], [13187, 1, "ma"], [13188, 1, "ka"], [13189, 1, "kb"], [13190, 1, "mb"], [13191, 1, "gb"], [13192, 1, "cal"], [13193, 1, "kcal"], [13194, 1, "pf"], [13195, 1, "nf"], [13196, 1, "\u03BCf"], [13197, 1, "\u03BCg"], [13198, 1, "mg"], [13199, 1, "kg"], [13200, 1, "hz"], [13201, 1, "khz"], [13202, 1, "mhz"], [13203, 1, "ghz"], [13204, 1, "thz"], [13205, 1, "\u03BCl"], [13206, 1, "ml"], [13207, 1, "dl"], [13208, 1, "kl"], [13209, 1, "fm"], [13210, 1, "nm"], [13211, 1, "\u03BCm"], [13212, 1, "mm"], [13213, 1, "cm"], [13214, 1, "km"], [13215, 1, "mm2"], [13216, 1, "cm2"], [13217, 1, "m2"], [13218, 1, "km2"], [13219, 1, "mm3"], [13220, 1, "cm3"], [13221, 1, "m3"], [13222, 1, "km3"], [13223, 1, "m\u2215s"], [13224, 1, "m\u2215s2"], [13225, 1, "pa"], [13226, 1, "kpa"], [13227, 1, "mpa"], [13228, 1, "gpa"], [13229, 1, "rad"], [13230, 1, "rad\u2215s"], [13231, 1, "rad\u2215s2"], [13232, 1, "ps"], [13233, 1, "ns"], [13234, 1, "\u03BCs"], [13235, 1, "ms"], [13236, 1, "pv"], [13237, 1, "nv"], [13238, 1, "\u03BCv"], [13239, 1, "mv"], [13240, 1, "kv"], [13241, 1, "mv"], [13242, 1, "pw"], [13243, 1, "nw"], [13244, 1, "\u03BCw"], [13245, 1, "mw"], [13246, 1, "kw"], [13247, 1, "mw"], [13248, 1, "k\u03C9"], [13249, 1, "m\u03C9"], [13250, 3], [13251, 1, "bq"], [13252, 1, "cc"], [13253, 1, "cd"], [13254, 1, "c\u2215kg"], [13255, 3], [13256, 1, "db"], [13257, 1, "gy"], [13258, 1, "ha"], [13259, 1, "hp"], [13260, 1, "in"], [13261, 1, "kk"], [13262, 1, "km"], [13263, 1, "kt"], [13264, 1, "lm"], [13265, 1, "ln"], [13266, 1, "log"], [13267, 1, "lx"], [13268, 1, "mb"], [13269, 1, "mil"], [13270, 1, "mol"], [13271, 1, "ph"], [13272, 3], [13273, 1, "ppm"], [13274, 1, "pr"], [13275, 1, "sr"], [13276, 1, "sv"], [13277, 1, "wb"], [13278, 1, "v\u2215m"], [13279, 1, "a\u2215m"], [13280, 1, "1\u65E5"], [13281, 1, "2\u65E5"], [13282, 1, "3\u65E5"], [13283, 1, "4\u65E5"], [13284, 1, "5\u65E5"], [13285, 1, "6\u65E5"], [13286, 1, "7\u65E5"], [13287, 1, "8\u65E5"], [13288, 1, "9\u65E5"], [13289, 1, "10\u65E5"], [13290, 1, "11\u65E5"], [13291, 1, "12\u65E5"], [13292, 1, "13\u65E5"], [13293, 1, "14\u65E5"], [13294, 1, "15\u65E5"], [13295, 1, "16\u65E5"], [13296, 1, "17\u65E5"], [13297, 1, "18\u65E5"], [13298, 1, "19\u65E5"], [13299, 1, "20\u65E5"], [13300, 1, "21\u65E5"], [13301, 1, "22\u65E5"], [13302, 1, "23\u65E5"], [13303, 1, "24\u65E5"], [13304, 1, "25\u65E5"], [13305, 1, "26\u65E5"], [13306, 1, "27\u65E5"], [13307, 1, "28\u65E5"], [13308, 1, "29\u65E5"], [13309, 1, "30\u65E5"], [13310, 1, "31\u65E5"], [13311, 1, "gal"], [[13312, 19893], 2], [[19894, 19903], 2], [[19904, 19967], 2], [[19968, 40869], 2], [[40870, 40891], 2], [[40892, 40899], 2], [[40900, 40907], 2], [40908, 2], [[40909, 40917], 2], [[40918, 40938], 2], [[40939, 40943], 2], [[40944, 40956], 2], [[40957, 40959], 2], [[40960, 42124], 2], [[42125, 42127], 3], [[42128, 42145], 2], [[42146, 42147], 2], [[42148, 42163], 2], [42164, 2], [[42165, 42176], 2], [42177, 2], [[42178, 42180], 2], [42181, 2], [42182, 2], [[42183, 42191], 3], [[42192, 42237], 2], [[42238, 42239], 2], [[42240, 42508], 2], [[42509, 42511], 2], [[42512, 42539], 2], [[42540, 42559], 3], [42560, 1, "\uA641"], [42561, 2], [42562, 1, "\uA643"], [42563, 2], [42564, 1, "\uA645"], [42565, 2], [42566, 1, "\uA647"], [42567, 2], [42568, 1, "\uA649"], [42569, 2], [42570, 1, "\uA64B"], [42571, 2], [42572, 1, "\uA64D"], [42573, 2], [42574, 1, "\uA64F"], [42575, 2], [42576, 1, "\uA651"], [42577, 2], [42578, 1, "\uA653"], [42579, 2], [42580, 1, "\uA655"], [42581, 2], [42582, 1, "\uA657"], [42583, 2], [42584, 1, "\uA659"], [42585, 2], [42586, 1, "\uA65B"], [42587, 2], [42588, 1, "\uA65D"], [42589, 2], [42590, 1, "\uA65F"], [42591, 2], [42592, 1, "\uA661"], [42593, 2], [42594, 1, "\uA663"], [42595, 2], [42596, 1, "\uA665"], [42597, 2], [42598, 1, "\uA667"], [42599, 2], [42600, 1, "\uA669"], [42601, 2], [42602, 1, "\uA66B"], [42603, 2], [42604, 1, "\uA66D"], [[42605, 42607], 2], [[42608, 42611], 2], [[42612, 42619], 2], [[42620, 42621], 2], [42622, 2], [42623, 2], [42624, 1, "\uA681"], [42625, 2], [42626, 1, "\uA683"], [42627, 2], [42628, 1, "\uA685"], [42629, 2], [42630, 1, "\uA687"], [42631, 2], [42632, 1, "\uA689"], [42633, 2], [42634, 1, "\uA68B"], [42635, 2], [42636, 1, "\uA68D"], [42637, 2], [42638, 1, "\uA68F"], [42639, 2], [42640, 1, "\uA691"], [42641, 2], [42642, 1, "\uA693"], [42643, 2], [42644, 1, "\uA695"], [42645, 2], [42646, 1, "\uA697"], [42647, 2], [42648, 1, "\uA699"], [42649, 2], [42650, 1, "\uA69B"], [42651, 2], [42652, 1, "\u044A"], [42653, 1, "\u044C"], [42654, 2], [42655, 2], [[42656, 42725], 2], [[42726, 42735], 2], [[42736, 42737], 2], [[42738, 42743], 2], [[42744, 42751], 3], [[42752, 42774], 2], [[42775, 42778], 2], [[42779, 42783], 2], [[42784, 42785], 2], [42786, 1, "\uA723"], [42787, 2], [42788, 1, "\uA725"], [42789, 2], [42790, 1, "\uA727"], [42791, 2], [42792, 1, "\uA729"], [42793, 2], [42794, 1, "\uA72B"], [42795, 2], [42796, 1, "\uA72D"], [42797, 2], [42798, 1, "\uA72F"], [[42799, 42801], 2], [42802, 1, "\uA733"], [42803, 2], [42804, 1, "\uA735"], [42805, 2], [42806, 1, "\uA737"], [42807, 2], [42808, 1, "\uA739"], [42809, 2], [42810, 1, "\uA73B"], [42811, 2], [42812, 1, "\uA73D"], [42813, 2], [42814, 1, "\uA73F"], [42815, 2], [42816, 1, "\uA741"], [42817, 2], [42818, 1, "\uA743"], [42819, 2], [42820, 1, "\uA745"], [42821, 2], [42822, 1, "\uA747"], [42823, 2], [42824, 1, "\uA749"], [42825, 2], [42826, 1, "\uA74B"], [42827, 2], [42828, 1, "\uA74D"], [42829, 2], [42830, 1, "\uA74F"], [42831, 2], [42832, 1, "\uA751"], [42833, 2], [42834, 1, "\uA753"], [42835, 2], [42836, 1, "\uA755"], [42837, 2], [42838, 1, "\uA757"], [42839, 2], [42840, 1, "\uA759"], [42841, 2], [42842, 1, "\uA75B"], [42843, 2], [42844, 1, "\uA75D"], [42845, 2], [42846, 1, "\uA75F"], [42847, 2], [42848, 1, "\uA761"], [42849, 2], [42850, 1, "\uA763"], [42851, 2], [42852, 1, "\uA765"], [42853, 2], [42854, 1, "\uA767"], [42855, 2], [42856, 1, "\uA769"], [42857, 2], [42858, 1, "\uA76B"], [42859, 2], [42860, 1, "\uA76D"], [42861, 2], [42862, 1, "\uA76F"], [42863, 2], [42864, 1, "\uA76F"], [[42865, 42872], 2], [42873, 1, "\uA77A"], [42874, 2], [42875, 1, "\uA77C"], [42876, 2], [42877, 1, "\u1D79"], [42878, 1, "\uA77F"], [42879, 2], [42880, 1, "\uA781"], [42881, 2], [42882, 1, "\uA783"], [42883, 2], [42884, 1, "\uA785"], [42885, 2], [42886, 1, "\uA787"], [[42887, 42888], 2], [[42889, 42890], 2], [42891, 1, "\uA78C"], [42892, 2], [42893, 1, "\u0265"], [42894, 2], [42895, 2], [42896, 1, "\uA791"], [42897, 2], [42898, 1, "\uA793"], [42899, 2], [[42900, 42901], 2], [42902, 1, "\uA797"], [42903, 2], [42904, 1, "\uA799"], [42905, 2], [42906, 1, "\uA79B"], [42907, 2], [42908, 1, "\uA79D"], [42909, 2], [42910, 1, "\uA79F"], [42911, 2], [42912, 1, "\uA7A1"], [42913, 2], [42914, 1, "\uA7A3"], [42915, 2], [42916, 1, "\uA7A5"], [42917, 2], [42918, 1, "\uA7A7"], [42919, 2], [42920, 1, "\uA7A9"], [42921, 2], [42922, 1, "\u0266"], [42923, 1, "\u025C"], [42924, 1, "\u0261"], [42925, 1, "\u026C"], [42926, 1, "\u026A"], [42927, 2], [42928, 1, "\u029E"], [42929, 1, "\u0287"], [42930, 1, "\u029D"], [42931, 1, "\uAB53"], [42932, 1, "\uA7B5"], [42933, 2], [42934, 1, "\uA7B7"], [42935, 2], [42936, 1, "\uA7B9"], [42937, 2], [42938, 1, "\uA7BB"], [42939, 2], [42940, 1, "\uA7BD"], [42941, 2], [42942, 1, "\uA7BF"], [42943, 2], [42944, 1, "\uA7C1"], [42945, 2], [42946, 1, "\uA7C3"], [42947, 2], [42948, 1, "\uA794"], [42949, 1, "\u0282"], [42950, 1, "\u1D8E"], [42951, 1, "\uA7C8"], [42952, 2], [42953, 1, "\uA7CA"], [42954, 2], [[42955, 42959], 3], [42960, 1, "\uA7D1"], [42961, 2], [42962, 3], [42963, 2], [42964, 3], [42965, 2], [42966, 1, "\uA7D7"], [42967, 2], [42968, 1, "\uA7D9"], [42969, 2], [[42970, 42993], 3], [42994, 1, "c"], [42995, 1, "f"], [42996, 1, "q"], [42997, 1, "\uA7F6"], [42998, 2], [42999, 2], [43e3, 1, "\u0127"], [43001, 1, "\u0153"], [43002, 2], [[43003, 43007], 2], [[43008, 43047], 2], [[43048, 43051], 2], [43052, 2], [[43053, 43055], 3], [[43056, 43065], 2], [[43066, 43071], 3], [[43072, 43123], 2], [[43124, 43127], 2], [[43128, 43135], 3], [[43136, 43204], 2], [43205, 2], [[43206, 43213], 3], [[43214, 43215], 2], [[43216, 43225], 2], [[43226, 43231], 3], [[43232, 43255], 2], [[43256, 43258], 2], [43259, 2], [43260, 2], [43261, 2], [[43262, 43263], 2], [[43264, 43309], 2], [[43310, 43311], 2], [[43312, 43347], 2], [[43348, 43358], 3], [43359, 2], [[43360, 43388], 2], [[43389, 43391], 3], [[43392, 43456], 2], [[43457, 43469], 2], [43470, 3], [[43471, 43481], 2], [[43482, 43485], 3], [[43486, 43487], 2], [[43488, 43518], 2], [43519, 3], [[43520, 43574], 2], [[43575, 43583], 3], [[43584, 43597], 2], [[43598, 43599], 3], [[43600, 43609], 2], [[43610, 43611], 3], [[43612, 43615], 2], [[43616, 43638], 2], [[43639, 43641], 2], [[43642, 43643], 2], [[43644, 43647], 2], [[43648, 43714], 2], [[43715, 43738], 3], [[43739, 43741], 2], [[43742, 43743], 2], [[43744, 43759], 2], [[43760, 43761], 2], [[43762, 43766], 2], [[43767, 43776], 3], [[43777, 43782], 2], [[43783, 43784], 3], [[43785, 43790], 2], [[43791, 43792], 3], [[43793, 43798], 2], [[43799, 43807], 3], [[43808, 43814], 2], [43815, 3], [[43816, 43822], 2], [43823, 3], [[43824, 43866], 2], [43867, 2], [43868, 1, "\uA727"], [43869, 1, "\uAB37"], [43870, 1, "\u026B"], [43871, 1, "\uAB52"], [[43872, 43875], 2], [[43876, 43877], 2], [[43878, 43879], 2], [43880, 2], [43881, 1, "\u028D"], [[43882, 43883], 2], [[43884, 43887], 3], [43888, 1, "\u13A0"], [43889, 1, "\u13A1"], [43890, 1, "\u13A2"], [43891, 1, "\u13A3"], [43892, 1, "\u13A4"], [43893, 1, "\u13A5"], [43894, 1, "\u13A6"], [43895, 1, "\u13A7"], [43896, 1, "\u13A8"], [43897, 1, "\u13A9"], [43898, 1, "\u13AA"], [43899, 1, "\u13AB"], [43900, 1, "\u13AC"], [43901, 1, "\u13AD"], [43902, 1, "\u13AE"], [43903, 1, "\u13AF"], [43904, 1, "\u13B0"], [43905, 1, "\u13B1"], [43906, 1, "\u13B2"], [43907, 1, "\u13B3"], [43908, 1, "\u13B4"], [43909, 1, "\u13B5"], [43910, 1, "\u13B6"], [43911, 1, "\u13B7"], [43912, 1, "\u13B8"], [43913, 1, "\u13B9"], [43914, 1, "\u13BA"], [43915, 1, "\u13BB"], [43916, 1, "\u13BC"], [43917, 1, "\u13BD"], [43918, 1, "\u13BE"], [43919, 1, "\u13BF"], [43920, 1, "\u13C0"], [43921, 1, "\u13C1"], [43922, 1, "\u13C2"], [43923, 1, "\u13C3"], [43924, 1, "\u13C4"], [43925, 1, "\u13C5"], [43926, 1, "\u13C6"], [43927, 1, "\u13C7"], [43928, 1, "\u13C8"], [43929, 1, "\u13C9"], [43930, 1, "\u13CA"], [43931, 1, "\u13CB"], [43932, 1, "\u13CC"], [43933, 1, "\u13CD"], [43934, 1, "\u13CE"], [43935, 1, "\u13CF"], [43936, 1, "\u13D0"], [43937, 1, "\u13D1"], [43938, 1, "\u13D2"], [43939, 1, "\u13D3"], [43940, 1, "\u13D4"], [43941, 1, "\u13D5"], [43942, 1, "\u13D6"], [43943, 1, "\u13D7"], [43944, 1, "\u13D8"], [43945, 1, "\u13D9"], [43946, 1, "\u13DA"], [43947, 1, "\u13DB"], [43948, 1, "\u13DC"], [43949, 1, "\u13DD"], [43950, 1, "\u13DE"], [43951, 1, "\u13DF"], [43952, 1, "\u13E0"], [43953, 1, "\u13E1"], [43954, 1, "\u13E2"], [43955, 1, "\u13E3"], [43956, 1, "\u13E4"], [43957, 1, "\u13E5"], [43958, 1, "\u13E6"], [43959, 1, "\u13E7"], [43960, 1, "\u13E8"], [43961, 1, "\u13E9"], [43962, 1, "\u13EA"], [43963, 1, "\u13EB"], [43964, 1, "\u13EC"], [43965, 1, "\u13ED"], [43966, 1, "\u13EE"], [43967, 1, "\u13EF"], [[43968, 44010], 2], [44011, 2], [[44012, 44013], 2], [[44014, 44015], 3], [[44016, 44025], 2], [[44026, 44031], 3], [[44032, 55203], 2], [[55204, 55215], 3], [[55216, 55238], 2], [[55239, 55242], 3], [[55243, 55291], 2], [[55292, 55295], 3], [[55296, 57343], 3], [[57344, 63743], 3], [63744, 1, "\u8C48"], [63745, 1, "\u66F4"], [63746, 1, "\u8ECA"], [63747, 1, "\u8CC8"], [63748, 1, "\u6ED1"], [63749, 1, "\u4E32"], [63750, 1, "\u53E5"], [[63751, 63752], 1, "\u9F9C"], [63753, 1, "\u5951"], [63754, 1, "\u91D1"], [63755, 1, "\u5587"], [63756, 1, "\u5948"], [63757, 1, "\u61F6"], [63758, 1, "\u7669"], [63759, 1, "\u7F85"], [63760, 1, "\u863F"], [63761, 1, "\u87BA"], [63762, 1, "\u88F8"], [63763, 1, "\u908F"], [63764, 1, "\u6A02"], [63765, 1, "\u6D1B"], [63766, 1, "\u70D9"], [63767, 1, "\u73DE"], [63768, 1, "\u843D"], [63769, 1, "\u916A"], [63770, 1, "\u99F1"], [63771, 1, "\u4E82"], [63772, 1, "\u5375"], [63773, 1, "\u6B04"], [63774, 1, "\u721B"], [63775, 1, "\u862D"], [63776, 1, "\u9E1E"], [63777, 1, "\u5D50"], [63778, 1, "\u6FEB"], [63779, 1, "\u85CD"], [63780, 1, "\u8964"], [63781, 1, "\u62C9"], [63782, 1, "\u81D8"], [63783, 1, "\u881F"], [63784, 1, "\u5ECA"], [63785, 1, "\u6717"], [63786, 1, "\u6D6A"], [63787, 1, "\u72FC"], [63788, 1, "\u90CE"], [63789, 1, "\u4F86"], [63790, 1, "\u51B7"], [63791, 1, "\u52DE"], [63792, 1, "\u64C4"], [63793, 1, "\u6AD3"], [63794, 1, "\u7210"], [63795, 1, "\u76E7"], [63796, 1, "\u8001"], [63797, 1, "\u8606"], [63798, 1, "\u865C"], [63799, 1, "\u8DEF"], [63800, 1, "\u9732"], [63801, 1, "\u9B6F"], [63802, 1, "\u9DFA"], [63803, 1, "\u788C"], [63804, 1, "\u797F"], [63805, 1, "\u7DA0"], [63806, 1, "\u83C9"], [63807, 1, "\u9304"], [63808, 1, "\u9E7F"], [63809, 1, "\u8AD6"], [63810, 1, "\u58DF"], [63811, 1, "\u5F04"], [63812, 1, "\u7C60"], [63813, 1, "\u807E"], [63814, 1, "\u7262"], [63815, 1, "\u78CA"], [63816, 1, "\u8CC2"], [63817, 1, "\u96F7"], [63818, 1, "\u58D8"], [63819, 1, "\u5C62"], [63820, 1, "\u6A13"], [63821, 1, "\u6DDA"], [63822, 1, "\u6F0F"], [63823, 1, "\u7D2F"], [63824, 1, "\u7E37"], [63825, 1, "\u964B"], [63826, 1, "\u52D2"], [63827, 1, "\u808B"], [63828, 1, "\u51DC"], [63829, 1, "\u51CC"], [63830, 1, "\u7A1C"], [63831, 1, "\u7DBE"], [63832, 1, "\u83F1"], [63833, 1, "\u9675"], [63834, 1, "\u8B80"], [63835, 1, "\u62CF"], [63836, 1, "\u6A02"], [63837, 1, "\u8AFE"], [63838, 1, "\u4E39"], [63839, 1, "\u5BE7"], [63840, 1, "\u6012"], [63841, 1, "\u7387"], [63842, 1, "\u7570"], [63843, 1, "\u5317"], [63844, 1, "\u78FB"], [63845, 1, "\u4FBF"], [63846, 1, "\u5FA9"], [63847, 1, "\u4E0D"], [63848, 1, "\u6CCC"], [63849, 1, "\u6578"], [63850, 1, "\u7D22"], [63851, 1, "\u53C3"], [63852, 1, "\u585E"], [63853, 1, "\u7701"], [63854, 1, "\u8449"], [63855, 1, "\u8AAA"], [63856, 1, "\u6BBA"], [63857, 1, "\u8FB0"], [63858, 1, "\u6C88"], [63859, 1, "\u62FE"], [63860, 1, "\u82E5"], [63861, 1, "\u63A0"], [63862, 1, "\u7565"], [63863, 1, "\u4EAE"], [63864, 1, "\u5169"], [63865, 1, "\u51C9"], [63866, 1, "\u6881"], [63867, 1, "\u7CE7"], [63868, 1, "\u826F"], [63869, 1, "\u8AD2"], [63870, 1, "\u91CF"], [63871, 1, "\u52F5"], [63872, 1, "\u5442"], [63873, 1, "\u5973"], [63874, 1, "\u5EEC"], [63875, 1, "\u65C5"], [63876, 1, "\u6FFE"], [63877, 1, "\u792A"], [63878, 1, "\u95AD"], [63879, 1, "\u9A6A"], [63880, 1, "\u9E97"], [63881, 1, "\u9ECE"], [63882, 1, "\u529B"], [63883, 1, "\u66C6"], [63884, 1, "\u6B77"], [63885, 1, "\u8F62"], [63886, 1, "\u5E74"], [63887, 1, "\u6190"], [63888, 1, "\u6200"], [63889, 1, "\u649A"], [63890, 1, "\u6F23"], [63891, 1, "\u7149"], [63892, 1, "\u7489"], [63893, 1, "\u79CA"], [63894, 1, "\u7DF4"], [63895, 1, "\u806F"], [63896, 1, "\u8F26"], [63897, 1, "\u84EE"], [63898, 1, "\u9023"], [63899, 1, "\u934A"], [63900, 1, "\u5217"], [63901, 1, "\u52A3"], [63902, 1, "\u54BD"], [63903, 1, "\u70C8"], [63904, 1, "\u88C2"], [63905, 1, "\u8AAA"], [63906, 1, "\u5EC9"], [63907, 1, "\u5FF5"], [63908, 1, "\u637B"], [63909, 1, "\u6BAE"], [63910, 1, "\u7C3E"], [63911, 1, "\u7375"], [63912, 1, "\u4EE4"], [63913, 1, "\u56F9"], [63914, 1, "\u5BE7"], [63915, 1, "\u5DBA"], [63916, 1, "\u601C"], [63917, 1, "\u73B2"], [63918, 1, "\u7469"], [63919, 1, "\u7F9A"], [63920, 1, "\u8046"], [63921, 1, "\u9234"], [63922, 1, "\u96F6"], [63923, 1, "\u9748"], [63924, 1, "\u9818"], [63925, 1, "\u4F8B"], [63926, 1, "\u79AE"], [63927, 1, "\u91B4"], [63928, 1, "\u96B8"], [63929, 1, "\u60E1"], [63930, 1, "\u4E86"], [63931, 1, "\u50DA"], [63932, 1, "\u5BEE"], [63933, 1, "\u5C3F"], [63934, 1, "\u6599"], [63935, 1, "\u6A02"], [63936, 1, "\u71CE"], [63937, 1, "\u7642"], [63938, 1, "\u84FC"], [63939, 1, "\u907C"], [63940, 1, "\u9F8D"], [63941, 1, "\u6688"], [63942, 1, "\u962E"], [63943, 1, "\u5289"], [63944, 1, "\u677B"], [63945, 1, "\u67F3"], [63946, 1, "\u6D41"], [63947, 1, "\u6E9C"], [63948, 1, "\u7409"], [63949, 1, "\u7559"], [63950, 1, "\u786B"], [63951, 1, "\u7D10"], [63952, 1, "\u985E"], [63953, 1, "\u516D"], [63954, 1, "\u622E"], [63955, 1, "\u9678"], [63956, 1, "\u502B"], [63957, 1, "\u5D19"], [63958, 1, "\u6DEA"], [63959, 1, "\u8F2A"], [63960, 1, "\u5F8B"], [63961, 1, "\u6144"], [63962, 1, "\u6817"], [63963, 1, "\u7387"], [63964, 1, "\u9686"], [63965, 1, "\u5229"], [63966, 1, "\u540F"], [63967, 1, "\u5C65"], [63968, 1, "\u6613"], [63969, 1, "\u674E"], [63970, 1, "\u68A8"], [63971, 1, "\u6CE5"], [63972, 1, "\u7406"], [63973, 1, "\u75E2"], [63974, 1, "\u7F79"], [63975, 1, "\u88CF"], [63976, 1, "\u88E1"], [63977, 1, "\u91CC"], [63978, 1, "\u96E2"], [63979, 1, "\u533F"], [63980, 1, "\u6EBA"], [63981, 1, "\u541D"], [63982, 1, "\u71D0"], [63983, 1, "\u7498"], [63984, 1, "\u85FA"], [63985, 1, "\u96A3"], [63986, 1, "\u9C57"], [63987, 1, "\u9E9F"], [63988, 1, "\u6797"], [63989, 1, "\u6DCB"], [63990, 1, "\u81E8"], [63991, 1, "\u7ACB"], [63992, 1, "\u7B20"], [63993, 1, "\u7C92"], [63994, 1, "\u72C0"], [63995, 1, "\u7099"], [63996, 1, "\u8B58"], [63997, 1, "\u4EC0"], [63998, 1, "\u8336"], [63999, 1, "\u523A"], [64e3, 1, "\u5207"], [64001, 1, "\u5EA6"], [64002, 1, "\u62D3"], [64003, 1, "\u7CD6"], [64004, 1, "\u5B85"], [64005, 1, "\u6D1E"], [64006, 1, "\u66B4"], [64007, 1, "\u8F3B"], [64008, 1, "\u884C"], [64009, 1, "\u964D"], [64010, 1, "\u898B"], [64011, 1, "\u5ED3"], [64012, 1, "\u5140"], [64013, 1, "\u55C0"], [[64014, 64015], 2], [64016, 1, "\u585A"], [64017, 2], [64018, 1, "\u6674"], [[64019, 64020], 2], [64021, 1, "\u51DE"], [64022, 1, "\u732A"], [64023, 1, "\u76CA"], [64024, 1, "\u793C"], [64025, 1, "\u795E"], [64026, 1, "\u7965"], [64027, 1, "\u798F"], [64028, 1, "\u9756"], [64029, 1, "\u7CBE"], [64030, 1, "\u7FBD"], [64031, 2], [64032, 1, "\u8612"], [64033, 2], [64034, 1, "\u8AF8"], [[64035, 64036], 2], [64037, 1, "\u9038"], [64038, 1, "\u90FD"], [[64039, 64041], 2], [64042, 1, "\u98EF"], [64043, 1, "\u98FC"], [64044, 1, "\u9928"], [64045, 1, "\u9DB4"], [64046, 1, "\u90DE"], [64047, 1, "\u96B7"], [64048, 1, "\u4FAE"], [64049, 1, "\u50E7"], [64050, 1, "\u514D"], [64051, 1, "\u52C9"], [64052, 1, "\u52E4"], [64053, 1, "\u5351"], [64054, 1, "\u559D"], [64055, 1, "\u5606"], [64056, 1, "\u5668"], [64057, 1, "\u5840"], [64058, 1, "\u58A8"], [64059, 1, "\u5C64"], [64060, 1, "\u5C6E"], [64061, 1, "\u6094"], [64062, 1, "\u6168"], [64063, 1, "\u618E"], [64064, 1, "\u61F2"], [64065, 1, "\u654F"], [64066, 1, "\u65E2"], [64067, 1, "\u6691"], [64068, 1, "\u6885"], [64069, 1, "\u6D77"], [64070, 1, "\u6E1A"], [64071, 1, "\u6F22"], [64072, 1, "\u716E"], [64073, 1, "\u722B"], [64074, 1, "\u7422"], [64075, 1, "\u7891"], [64076, 1, "\u793E"], [64077, 1, "\u7949"], [64078, 1, "\u7948"], [64079, 1, "\u7950"], [64080, 1, "\u7956"], [64081, 1, "\u795D"], [64082, 1, "\u798D"], [64083, 1, "\u798E"], [64084, 1, "\u7A40"], [64085, 1, "\u7A81"], [64086, 1, "\u7BC0"], [64087, 1, "\u7DF4"], [64088, 1, "\u7E09"], [64089, 1, "\u7E41"], [64090, 1, "\u7F72"], [64091, 1, "\u8005"], [64092, 1, "\u81ED"], [[64093, 64094], 1, "\u8279"], [64095, 1, "\u8457"], [64096, 1, "\u8910"], [64097, 1, "\u8996"], [64098, 1, "\u8B01"], [64099, 1, "\u8B39"], [64100, 1, "\u8CD3"], [64101, 1, "\u8D08"], [64102, 1, "\u8FB6"], [64103, 1, "\u9038"], [64104, 1, "\u96E3"], [64105, 1, "\u97FF"], [64106, 1, "\u983B"], [64107, 1, "\u6075"], [64108, 1, "\u{242EE}"], [64109, 1, "\u8218"], [[64110, 64111], 3], [64112, 1, "\u4E26"], [64113, 1, "\u51B5"], [64114, 1, "\u5168"], [64115, 1, "\u4F80"], [64116, 1, "\u5145"], [64117, 1, "\u5180"], [64118, 1, "\u52C7"], [64119, 1, "\u52FA"], [64120, 1, "\u559D"], [64121, 1, "\u5555"], [64122, 1, "\u5599"], [64123, 1, "\u55E2"], [64124, 1, "\u585A"], [64125, 1, "\u58B3"], [64126, 1, "\u5944"], [64127, 1, "\u5954"], [64128, 1, "\u5A62"], [64129, 1, "\u5B28"], [64130, 1, "\u5ED2"], [64131, 1, "\u5ED9"], [64132, 1, "\u5F69"], [64133, 1, "\u5FAD"], [64134, 1, "\u60D8"], [64135, 1, "\u614E"], [64136, 1, "\u6108"], [64137, 1, "\u618E"], [64138, 1, "\u6160"], [64139, 1, "\u61F2"], [64140, 1, "\u6234"], [64141, 1, "\u63C4"], [64142, 1, "\u641C"], [64143, 1, "\u6452"], [64144, 1, "\u6556"], [64145, 1, "\u6674"], [64146, 1, "\u6717"], [64147, 1, "\u671B"], [64148, 1, "\u6756"], [64149, 1, "\u6B79"], [64150, 1, "\u6BBA"], [64151, 1, "\u6D41"], [64152, 1, "\u6EDB"], [64153, 1, "\u6ECB"], [64154, 1, "\u6F22"], [64155, 1, "\u701E"], [64156, 1, "\u716E"], [64157, 1, "\u77A7"], [64158, 1, "\u7235"], [64159, 1, "\u72AF"], [64160, 1, "\u732A"], [64161, 1, "\u7471"], [64162, 1, "\u7506"], [64163, 1, "\u753B"], [64164, 1, "\u761D"], [64165, 1, "\u761F"], [64166, 1, "\u76CA"], [64167, 1, "\u76DB"], [64168, 1, "\u76F4"], [64169, 1, "\u774A"], [64170, 1, "\u7740"], [64171, 1, "\u78CC"], [64172, 1, "\u7AB1"], [64173, 1, "\u7BC0"], [64174, 1, "\u7C7B"], [64175, 1, "\u7D5B"], [64176, 1, "\u7DF4"], [64177, 1, "\u7F3E"], [64178, 1, "\u8005"], [64179, 1, "\u8352"], [64180, 1, "\u83EF"], [64181, 1, "\u8779"], [64182, 1, "\u8941"], [64183, 1, "\u8986"], [64184, 1, "\u8996"], [64185, 1, "\u8ABF"], [64186, 1, "\u8AF8"], [64187, 1, "\u8ACB"], [64188, 1, "\u8B01"], [64189, 1, "\u8AFE"], [64190, 1, "\u8AED"], [64191, 1, "\u8B39"], [64192, 1, "\u8B8A"], [64193, 1, "\u8D08"], [64194, 1, "\u8F38"], [64195, 1, "\u9072"], [64196, 1, "\u9199"], [64197, 1, "\u9276"], [64198, 1, "\u967C"], [64199, 1, "\u96E3"], [64200, 1, "\u9756"], [64201, 1, "\u97DB"], [64202, 1, "\u97FF"], [64203, 1, "\u980B"], [64204, 1, "\u983B"], [64205, 1, "\u9B12"], [64206, 1, "\u9F9C"], [64207, 1, "\u{2284A}"], [64208, 1, "\u{22844}"], [64209, 1, "\u{233D5}"], [64210, 1, "\u3B9D"], [64211, 1, "\u4018"], [64212, 1, "\u4039"], [64213, 1, "\u{25249}"], [64214, 1, "\u{25CD0}"], [64215, 1, "\u{27ED3}"], [64216, 1, "\u9F43"], [64217, 1, "\u9F8E"], [[64218, 64255], 3], [64256, 1, "ff"], [64257, 1, "fi"], [64258, 1, "fl"], [64259, 1, "ffi"], [64260, 1, "ffl"], [[64261, 64262], 1, "st"], [[64263, 64274], 3], [64275, 1, "\u0574\u0576"], [64276, 1, "\u0574\u0565"], [64277, 1, "\u0574\u056B"], [64278, 1, "\u057E\u0576"], [64279, 1, "\u0574\u056D"], [[64280, 64284], 3], [64285, 1, "\u05D9\u05B4"], [64286, 2], [64287, 1, "\u05F2\u05B7"], [64288, 1, "\u05E2"], [64289, 1, "\u05D0"], [64290, 1, "\u05D3"], [64291, 1, "\u05D4"], [64292, 1, "\u05DB"], [64293, 1, "\u05DC"], [64294, 1, "\u05DD"], [64295, 1, "\u05E8"], [64296, 1, "\u05EA"], [64297, 5, "+"], [64298, 1, "\u05E9\u05C1"], [64299, 1, "\u05E9\u05C2"], [64300, 1, "\u05E9\u05BC\u05C1"], [64301, 1, "\u05E9\u05BC\u05C2"], [64302, 1, "\u05D0\u05B7"], [64303, 1, "\u05D0\u05B8"], [64304, 1, "\u05D0\u05BC"], [64305, 1, "\u05D1\u05BC"], [64306, 1, "\u05D2\u05BC"], [64307, 1, "\u05D3\u05BC"], [64308, 1, "\u05D4\u05BC"], [64309, 1, "\u05D5\u05BC"], [64310, 1, "\u05D6\u05BC"], [64311, 3], [64312, 1, "\u05D8\u05BC"], [64313, 1, "\u05D9\u05BC"], [64314, 1, "\u05DA\u05BC"], [64315, 1, "\u05DB\u05BC"], [64316, 1, "\u05DC\u05BC"], [64317, 3], [64318, 1, "\u05DE\u05BC"], [64319, 3], [64320, 1, "\u05E0\u05BC"], [64321, 1, "\u05E1\u05BC"], [64322, 3], [64323, 1, "\u05E3\u05BC"], [64324, 1, "\u05E4\u05BC"], [64325, 3], [64326, 1, "\u05E6\u05BC"], [64327, 1, "\u05E7\u05BC"], [64328, 1, "\u05E8\u05BC"], [64329, 1, "\u05E9\u05BC"], [64330, 1, "\u05EA\u05BC"], [64331, 1, "\u05D5\u05B9"], [64332, 1, "\u05D1\u05BF"], [64333, 1, "\u05DB\u05BF"], [64334, 1, "\u05E4\u05BF"], [64335, 1, "\u05D0\u05DC"], [[64336, 64337], 1, "\u0671"], [[64338, 64341], 1, "\u067B"], [[64342, 64345], 1, "\u067E"], [[64346, 64349], 1, "\u0680"], [[64350, 64353], 1, "\u067A"], [[64354, 64357], 1, "\u067F"], [[64358, 64361], 1, "\u0679"], [[64362, 64365], 1, "\u06A4"], [[64366, 64369], 1, "\u06A6"], [[64370, 64373], 1, "\u0684"], [[64374, 64377], 1, "\u0683"], [[64378, 64381], 1, "\u0686"], [[64382, 64385], 1, "\u0687"], [[64386, 64387], 1, "\u068D"], [[64388, 64389], 1, "\u068C"], [[64390, 64391], 1, "\u068E"], [[64392, 64393], 1, "\u0688"], [[64394, 64395], 1, "\u0698"], [[64396, 64397], 1, "\u0691"], [[64398, 64401], 1, "\u06A9"], [[64402, 64405], 1, "\u06AF"], [[64406, 64409], 1, "\u06B3"], [[64410, 64413], 1, "\u06B1"], [[64414, 64415], 1, "\u06BA"], [[64416, 64419], 1, "\u06BB"], [[64420, 64421], 1, "\u06C0"], [[64422, 64425], 1, "\u06C1"], [[64426, 64429], 1, "\u06BE"], [[64430, 64431], 1, "\u06D2"], [[64432, 64433], 1, "\u06D3"], [[64434, 64449], 2], [64450, 2], [[64451, 64466], 3], [[64467, 64470], 1, "\u06AD"], [[64471, 64472], 1, "\u06C7"], [[64473, 64474], 1, "\u06C6"], [[64475, 64476], 1, "\u06C8"], [64477, 1, "\u06C7\u0674"], [[64478, 64479], 1, "\u06CB"], [[64480, 64481], 1, "\u06C5"], [[64482, 64483], 1, "\u06C9"], [[64484, 64487], 1, "\u06D0"], [[64488, 64489], 1, "\u0649"], [[64490, 64491], 1, "\u0626\u0627"], [[64492, 64493], 1, "\u0626\u06D5"], [[64494, 64495], 1, "\u0626\u0648"], [[64496, 64497], 1, "\u0626\u06C7"], [[64498, 64499], 1, "\u0626\u06C6"], [[64500, 64501], 1, "\u0626\u06C8"], [[64502, 64504], 1, "\u0626\u06D0"], [[64505, 64507], 1, "\u0626\u0649"], [[64508, 64511], 1, "\u06CC"], [64512, 1, "\u0626\u062C"], [64513, 1, "\u0626\u062D"], [64514, 1, "\u0626\u0645"], [64515, 1, "\u0626\u0649"], [64516, 1, "\u0626\u064A"], [64517, 1, "\u0628\u062C"], [64518, 1, "\u0628\u062D"], [64519, 1, "\u0628\u062E"], [64520, 1, "\u0628\u0645"], [64521, 1, "\u0628\u0649"], [64522, 1, "\u0628\u064A"], [64523, 1, "\u062A\u062C"], [64524, 1, "\u062A\u062D"], [64525, 1, "\u062A\u062E"], [64526, 1, "\u062A\u0645"], [64527, 1, "\u062A\u0649"], [64528, 1, "\u062A\u064A"], [64529, 1, "\u062B\u062C"], [64530, 1, "\u062B\u0645"], [64531, 1, "\u062B\u0649"], [64532, 1, "\u062B\u064A"], [64533, 1, "\u062C\u062D"], [64534, 1, "\u062C\u0645"], [64535, 1, "\u062D\u062C"], [64536, 1, "\u062D\u0645"], [64537, 1, "\u062E\u062C"], [64538, 1, "\u062E\u062D"], [64539, 1, "\u062E\u0645"], [64540, 1, "\u0633\u062C"], [64541, 1, "\u0633\u062D"], [64542, 1, "\u0633\u062E"], [64543, 1, "\u0633\u0645"], [64544, 1, "\u0635\u062D"], [64545, 1, "\u0635\u0645"], [64546, 1, "\u0636\u062C"], [64547, 1, "\u0636\u062D"], [64548, 1, "\u0636\u062E"], [64549, 1, "\u0636\u0645"], [64550, 1, "\u0637\u062D"], [64551, 1, "\u0637\u0645"], [64552, 1, "\u0638\u0645"], [64553, 1, "\u0639\u062C"], [64554, 1, "\u0639\u0645"], [64555, 1, "\u063A\u062C"], [64556, 1, "\u063A\u0645"], [64557, 1, "\u0641\u062C"], [64558, 1, "\u0641\u062D"], [64559, 1, "\u0641\u062E"], [64560, 1, "\u0641\u0645"], [64561, 1, "\u0641\u0649"], [64562, 1, "\u0641\u064A"], [64563, 1, "\u0642\u062D"], [64564, 1, "\u0642\u0645"], [64565, 1, "\u0642\u0649"], [64566, 1, "\u0642\u064A"], [64567, 1, "\u0643\u0627"], [64568, 1, "\u0643\u062C"], [64569, 1, "\u0643\u062D"], [64570, 1, "\u0643\u062E"], [64571, 1, "\u0643\u0644"], [64572, 1, "\u0643\u0645"], [64573, 1, "\u0643\u0649"], [64574, 1, "\u0643\u064A"], [64575, 1, "\u0644\u062C"], [64576, 1, "\u0644\u062D"], [64577, 1, "\u0644\u062E"], [64578, 1, "\u0644\u0645"], [64579, 1, "\u0644\u0649"], [64580, 1, "\u0644\u064A"], [64581, 1, "\u0645\u062C"], [64582, 1, "\u0645\u062D"], [64583, 1, "\u0645\u062E"], [64584, 1, "\u0645\u0645"], [64585, 1, "\u0645\u0649"], [64586, 1, "\u0645\u064A"], [64587, 1, "\u0646\u062C"], [64588, 1, "\u0646\u062D"], [64589, 1, "\u0646\u062E"], [64590, 1, "\u0646\u0645"], [64591, 1, "\u0646\u0649"], [64592, 1, "\u0646\u064A"], [64593, 1, "\u0647\u062C"], [64594, 1, "\u0647\u0645"], [64595, 1, "\u0647\u0649"], [64596, 1, "\u0647\u064A"], [64597, 1, "\u064A\u062C"], [64598, 1, "\u064A\u062D"], [64599, 1, "\u064A\u062E"], [64600, 1, "\u064A\u0645"], [64601, 1, "\u064A\u0649"], [64602, 1, "\u064A\u064A"], [64603, 1, "\u0630\u0670"], [64604, 1, "\u0631\u0670"], [64605, 1, "\u0649\u0670"], [64606, 5, " \u064C\u0651"], [64607, 5, " \u064D\u0651"], [64608, 5, " \u064E\u0651"], [64609, 5, " \u064F\u0651"], [64610, 5, " \u0650\u0651"], [64611, 5, " \u0651\u0670"], [64612, 1, "\u0626\u0631"], [64613, 1, "\u0626\u0632"], [64614, 1, "\u0626\u0645"], [64615, 1, "\u0626\u0646"], [64616, 1, "\u0626\u0649"], [64617, 1, "\u0626\u064A"], [64618, 1, "\u0628\u0631"], [64619, 1, "\u0628\u0632"], [64620, 1, "\u0628\u0645"], [64621, 1, "\u0628\u0646"], [64622, 1, "\u0628\u0649"], [64623, 1, "\u0628\u064A"], [64624, 1, "\u062A\u0631"], [64625, 1, "\u062A\u0632"], [64626, 1, "\u062A\u0645"], [64627, 1, "\u062A\u0646"], [64628, 1, "\u062A\u0649"], [64629, 1, "\u062A\u064A"], [64630, 1, "\u062B\u0631"], [64631, 1, "\u062B\u0632"], [64632, 1, "\u062B\u0645"], [64633, 1, "\u062B\u0646"], [64634, 1, "\u062B\u0649"], [64635, 1, "\u062B\u064A"], [64636, 1, "\u0641\u0649"], [64637, 1, "\u0641\u064A"], [64638, 1, "\u0642\u0649"], [64639, 1, "\u0642\u064A"], [64640, 1, "\u0643\u0627"], [64641, 1, "\u0643\u0644"], [64642, 1, "\u0643\u0645"], [64643, 1, "\u0643\u0649"], [64644, 1, "\u0643\u064A"], [64645, 1, "\u0644\u0645"], [64646, 1, "\u0644\u0649"], [64647, 1, "\u0644\u064A"], [64648, 1, "\u0645\u0627"], [64649, 1, "\u0645\u0645"], [64650, 1, "\u0646\u0631"], [64651, 1, "\u0646\u0632"], [64652, 1, "\u0646\u0645"], [64653, 1, "\u0646\u0646"], [64654, 1, "\u0646\u0649"], [64655, 1, "\u0646\u064A"], [64656, 1, "\u0649\u0670"], [64657, 1, "\u064A\u0631"], [64658, 1, "\u064A\u0632"], [64659, 1, "\u064A\u0645"], [64660, 1, "\u064A\u0646"], [64661, 1, "\u064A\u0649"], [64662, 1, "\u064A\u064A"], [64663, 1, "\u0626\u062C"], [64664, 1, "\u0626\u062D"], [64665, 1, "\u0626\u062E"], [64666, 1, "\u0626\u0645"], [64667, 1, "\u0626\u0647"], [64668, 1, "\u0628\u062C"], [64669, 1, "\u0628\u062D"], [64670, 1, "\u0628\u062E"], [64671, 1, "\u0628\u0645"], [64672, 1, "\u0628\u0647"], [64673, 1, "\u062A\u062C"], [64674, 1, "\u062A\u062D"], [64675, 1, "\u062A\u062E"], [64676, 1, "\u062A\u0645"], [64677, 1, "\u062A\u0647"], [64678, 1, "\u062B\u0645"], [64679, 1, "\u062C\u062D"], [64680, 1, "\u062C\u0645"], [64681, 1, "\u062D\u062C"], [64682, 1, "\u062D\u0645"], [64683, 1, "\u062E\u062C"], [64684, 1, "\u062E\u0645"], [64685, 1, "\u0633\u062C"], [64686, 1, "\u0633\u062D"], [64687, 1, "\u0633\u062E"], [64688, 1, "\u0633\u0645"], [64689, 1, "\u0635\u062D"], [64690, 1, "\u0635\u062E"], [64691, 1, "\u0635\u0645"], [64692, 1, "\u0636\u062C"], [64693, 1, "\u0636\u062D"], [64694, 1, "\u0636\u062E"], [64695, 1, "\u0636\u0645"], [64696, 1, "\u0637\u062D"], [64697, 1, "\u0638\u0645"], [64698, 1, "\u0639\u062C"], [64699, 1, "\u0639\u0645"], [64700, 1, "\u063A\u062C"], [64701, 1, "\u063A\u0645"], [64702, 1, "\u0641\u062C"], [64703, 1, "\u0641\u062D"], [64704, 1, "\u0641\u062E"], [64705, 1, "\u0641\u0645"], [64706, 1, "\u0642\u062D"], [64707, 1, "\u0642\u0645"], [64708, 1, "\u0643\u062C"], [64709, 1, "\u0643\u062D"], [64710, 1, "\u0643\u062E"], [64711, 1, "\u0643\u0644"], [64712, 1, "\u0643\u0645"], [64713, 1, "\u0644\u062C"], [64714, 1, "\u0644\u062D"], [64715, 1, "\u0644\u062E"], [64716, 1, "\u0644\u0645"], [64717, 1, "\u0644\u0647"], [64718, 1, "\u0645\u062C"], [64719, 1, "\u0645\u062D"], [64720, 1, "\u0645\u062E"], [64721, 1, "\u0645\u0645"], [64722, 1, "\u0646\u062C"], [64723, 1, "\u0646\u062D"], [64724, 1, "\u0646\u062E"], [64725, 1, "\u0646\u0645"], [64726, 1, "\u0646\u0647"], [64727, 1, "\u0647\u062C"], [64728, 1, "\u0647\u0645"], [64729, 1, "\u0647\u0670"], [64730, 1, "\u064A\u062C"], [64731, 1, "\u064A\u062D"], [64732, 1, "\u064A\u062E"], [64733, 1, "\u064A\u0645"], [64734, 1, "\u064A\u0647"], [64735, 1, "\u0626\u0645"], [64736, 1, "\u0626\u0647"], [64737, 1, "\u0628\u0645"], [64738, 1, "\u0628\u0647"], [64739, 1, "\u062A\u0645"], [64740, 1, "\u062A\u0647"], [64741, 1, "\u062B\u0645"], [64742, 1, "\u062B\u0647"], [64743, 1, "\u0633\u0645"], [64744, 1, "\u0633\u0647"], [64745, 1, "\u0634\u0645"], [64746, 1, "\u0634\u0647"], [64747, 1, "\u0643\u0644"], [64748, 1, "\u0643\u0645"], [64749, 1, "\u0644\u0645"], [64750, 1, "\u0646\u0645"], [64751, 1, "\u0646\u0647"], [64752, 1, "\u064A\u0645"], [64753, 1, "\u064A\u0647"], [64754, 1, "\u0640\u064E\u0651"], [64755, 1, "\u0640\u064F\u0651"], [64756, 1, "\u0640\u0650\u0651"], [64757, 1, "\u0637\u0649"], [64758, 1, "\u0637\u064A"], [64759, 1, "\u0639\u0649"], [64760, 1, "\u0639\u064A"], [64761, 1, "\u063A\u0649"], [64762, 1, "\u063A\u064A"], [64763, 1, "\u0633\u0649"], [64764, 1, "\u0633\u064A"], [64765, 1, "\u0634\u0649"], [64766, 1, "\u0634\u064A"], [64767, 1, "\u062D\u0649"], [64768, 1, "\u062D\u064A"], [64769, 1, "\u062C\u0649"], [64770, 1, "\u062C\u064A"], [64771, 1, "\u062E\u0649"], [64772, 1, "\u062E\u064A"], [64773, 1, "\u0635\u0649"], [64774, 1, "\u0635\u064A"], [64775, 1, "\u0636\u0649"], [64776, 1, "\u0636\u064A"], [64777, 1, "\u0634\u062C"], [64778, 1, "\u0634\u062D"], [64779, 1, "\u0634\u062E"], [64780, 1, "\u0634\u0645"], [64781, 1, "\u0634\u0631"], [64782, 1, "\u0633\u0631"], [64783, 1, "\u0635\u0631"], [64784, 1, "\u0636\u0631"], [64785, 1, "\u0637\u0649"], [64786, 1, "\u0637\u064A"], [64787, 1, "\u0639\u0649"], [64788, 1, "\u0639\u064A"], [64789, 1, "\u063A\u0649"], [64790, 1, "\u063A\u064A"], [64791, 1, "\u0633\u0649"], [64792, 1, "\u0633\u064A"], [64793, 1, "\u0634\u0649"], [64794, 1, "\u0634\u064A"], [64795, 1, "\u062D\u0649"], [64796, 1, "\u062D\u064A"], [64797, 1, "\u062C\u0649"], [64798, 1, "\u062C\u064A"], [64799, 1, "\u062E\u0649"], [64800, 1, "\u062E\u064A"], [64801, 1, "\u0635\u0649"], [64802, 1, "\u0635\u064A"], [64803, 1, "\u0636\u0649"], [64804, 1, "\u0636\u064A"], [64805, 1, "\u0634\u062C"], [64806, 1, "\u0634\u062D"], [64807, 1, "\u0634\u062E"], [64808, 1, "\u0634\u0645"], [64809, 1, "\u0634\u0631"], [64810, 1, "\u0633\u0631"], [64811, 1, "\u0635\u0631"], [64812, 1, "\u0636\u0631"], [64813, 1, "\u0634\u062C"], [64814, 1, "\u0634\u062D"], [64815, 1, "\u0634\u062E"], [64816, 1, "\u0634\u0645"], [64817, 1, "\u0633\u0647"], [64818, 1, "\u0634\u0647"], [64819, 1, "\u0637\u0645"], [64820, 1, "\u0633\u062C"], [64821, 1, "\u0633\u062D"], [64822, 1, "\u0633\u062E"], [64823, 1, "\u0634\u062C"], [64824, 1, "\u0634\u062D"], [64825, 1, "\u0634\u062E"], [64826, 1, "\u0637\u0645"], [64827, 1, "\u0638\u0645"], [[64828, 64829], 1, "\u0627\u064B"], [[64830, 64831], 2], [[64832, 64847], 2], [64848, 1, "\u062A\u062C\u0645"], [[64849, 64850], 1, "\u062A\u062D\u062C"], [64851, 1, "\u062A\u062D\u0645"], [64852, 1, "\u062A\u062E\u0645"], [64853, 1, "\u062A\u0645\u062C"], [64854, 1, "\u062A\u0645\u062D"], [64855, 1, "\u062A\u0645\u062E"], [[64856, 64857], 1, "\u062C\u0645\u062D"], [64858, 1, "\u062D\u0645\u064A"], [64859, 1, "\u062D\u0645\u0649"], [64860, 1, "\u0633\u062D\u062C"], [64861, 1, "\u0633\u062C\u062D"], [64862, 1, "\u0633\u062C\u0649"], [[64863, 64864], 1, "\u0633\u0645\u062D"], [64865, 1, "\u0633\u0645\u062C"], [[64866, 64867], 1, "\u0633\u0645\u0645"], [[64868, 64869], 1, "\u0635\u062D\u062D"], [64870, 1, "\u0635\u0645\u0645"], [[64871, 64872], 1, "\u0634\u062D\u0645"], [64873, 1, "\u0634\u062C\u064A"], [[64874, 64875], 1, "\u0634\u0645\u062E"], [[64876, 64877], 1, "\u0634\u0645\u0645"], [64878, 1, "\u0636\u062D\u0649"], [[64879, 64880], 1, "\u0636\u062E\u0645"], [[64881, 64882], 1, "\u0637\u0645\u062D"], [64883, 1, "\u0637\u0645\u0645"], [64884, 1, "\u0637\u0645\u064A"], [64885, 1, "\u0639\u062C\u0645"], [[64886, 64887], 1, "\u0639\u0645\u0645"], [64888, 1, "\u0639\u0645\u0649"], [64889, 1, "\u063A\u0645\u0645"], [64890, 1, "\u063A\u0645\u064A"], [64891, 1, "\u063A\u0645\u0649"], [[64892, 64893], 1, "\u0641\u062E\u0645"], [64894, 1, "\u0642\u0645\u062D"], [64895, 1, "\u0642\u0645\u0645"], [64896, 1, "\u0644\u062D\u0645"], [64897, 1, "\u0644\u062D\u064A"], [64898, 1, "\u0644\u062D\u0649"], [[64899, 64900], 1, "\u0644\u062C\u062C"], [[64901, 64902], 1, "\u0644\u062E\u0645"], [[64903, 64904], 1, "\u0644\u0645\u062D"], [64905, 1, "\u0645\u062D\u062C"], [64906, 1, "\u0645\u062D\u0645"], [64907, 1, "\u0645\u062D\u064A"], [64908, 1, "\u0645\u062C\u062D"], [64909, 1, "\u0645\u062C\u0645"], [64910, 1, "\u0645\u062E\u062C"], [64911, 1, "\u0645\u062E\u0645"], [[64912, 64913], 3], [64914, 1, "\u0645\u062C\u062E"], [64915, 1, "\u0647\u0645\u062C"], [64916, 1, "\u0647\u0645\u0645"], [64917, 1, "\u0646\u062D\u0645"], [64918, 1, "\u0646\u062D\u0649"], [[64919, 64920], 1, "\u0646\u062C\u0645"], [64921, 1, "\u0646\u062C\u0649"], [64922, 1, "\u0646\u0645\u064A"], [64923, 1, "\u0646\u0645\u0649"], [[64924, 64925], 1, "\u064A\u0645\u0645"], [64926, 1, "\u0628\u062E\u064A"], [64927, 1, "\u062A\u062C\u064A"], [64928, 1, "\u062A\u062C\u0649"], [64929, 1, "\u062A\u062E\u064A"], [64930, 1, "\u062A\u062E\u0649"], [64931, 1, "\u062A\u0645\u064A"], [64932, 1, "\u062A\u0645\u0649"], [64933, 1, "\u062C\u0645\u064A"], [64934, 1, "\u062C\u062D\u0649"], [64935, 1, "\u062C\u0645\u0649"], [64936, 1, "\u0633\u062E\u0649"], [64937, 1, "\u0635\u062D\u064A"], [64938, 1, "\u0634\u062D\u064A"], [64939, 1, "\u0636\u062D\u064A"], [64940, 1, "\u0644\u062C\u064A"], [64941, 1, "\u0644\u0645\u064A"], [64942, 1, "\u064A\u062D\u064A"], [64943, 1, "\u064A\u062C\u064A"], [64944, 1, "\u064A\u0645\u064A"], [64945, 1, "\u0645\u0645\u064A"], [64946, 1, "\u0642\u0645\u064A"], [64947, 1, "\u0646\u062D\u064A"], [64948, 1, "\u0642\u0645\u062D"], [64949, 1, "\u0644\u062D\u0645"], [64950, 1, "\u0639\u0645\u064A"], [64951, 1, "\u0643\u0645\u064A"], [64952, 1, "\u0646\u062C\u062D"], [64953, 1, "\u0645\u062E\u064A"], [64954, 1, "\u0644\u062C\u0645"], [64955, 1, "\u0643\u0645\u0645"], [64956, 1, "\u0644\u062C\u0645"], [64957, 1, "\u0646\u062C\u062D"], [64958, 1, "\u062C\u062D\u064A"], [64959, 1, "\u062D\u062C\u064A"], [64960, 1, "\u0645\u062C\u064A"], [64961, 1, "\u0641\u0645\u064A"], [64962, 1, "\u0628\u062D\u064A"], [64963, 1, "\u0643\u0645\u0645"], [64964, 1, "\u0639\u062C\u0645"], [64965, 1, "\u0635\u0645\u0645"], [64966, 1, "\u0633\u062E\u064A"], [64967, 1, "\u0646\u062C\u064A"], [[64968, 64974], 3], [64975, 2], [[64976, 65007], 3], [65008, 1, "\u0635\u0644\u06D2"], [65009, 1, "\u0642\u0644\u06D2"], [65010, 1, "\u0627\u0644\u0644\u0647"], [65011, 1, "\u0627\u0643\u0628\u0631"], [65012, 1, "\u0645\u062D\u0645\u062F"], [65013, 1, "\u0635\u0644\u0639\u0645"], [65014, 1, "\u0631\u0633\u0648\u0644"], [65015, 1, "\u0639\u0644\u064A\u0647"], [65016, 1, "\u0648\u0633\u0644\u0645"], [65017, 1, "\u0635\u0644\u0649"], [65018, 5, "\u0635\u0644\u0649 \u0627\u0644\u0644\u0647 \u0639\u0644\u064A\u0647 \u0648\u0633\u0644\u0645"], [65019, 5, "\u062C\u0644 \u062C\u0644\u0627\u0644\u0647"], [65020, 1, "\u0631\u06CC\u0627\u0644"], [65021, 2], [[65022, 65023], 2], [[65024, 65039], 7], [65040, 5, ","], [65041, 1, "\u3001"], [65042, 3], [65043, 5, ":"], [65044, 5, ";"], [65045, 5, "!"], [65046, 5, "?"], [65047, 1, "\u3016"], [65048, 1, "\u3017"], [65049, 3], [[65050, 65055], 3], [[65056, 65059], 2], [[65060, 65062], 2], [[65063, 65069], 2], [[65070, 65071], 2], [65072, 3], [65073, 1, "\u2014"], [65074, 1, "\u2013"], [[65075, 65076], 5, "_"], [65077, 5, "("], [65078, 5, ")"], [65079, 5, "{"], [65080, 5, "}"], [65081, 1, "\u3014"], [65082, 1, "\u3015"], [65083, 1, "\u3010"], [65084, 1, "\u3011"], [65085, 1, "\u300A"], [65086, 1, "\u300B"], [65087, 1, "\u3008"], [65088, 1, "\u3009"], [65089, 1, "\u300C"], [65090, 1, "\u300D"], [65091, 1, "\u300E"], [65092, 1, "\u300F"], [[65093, 65094], 2], [65095, 5, "["], [65096, 5, "]"], [[65097, 65100], 5, " \u0305"], [[65101, 65103], 5, "_"], [65104, 5, ","], [65105, 1, "\u3001"], [65106, 3], [65107, 3], [65108, 5, ";"], [65109, 5, ":"], [65110, 5, "?"], [65111, 5, "!"], [65112, 1, "\u2014"], [65113, 5, "("], [65114, 5, ")"], [65115, 5, "{"], [65116, 5, "}"], [65117, 1, "\u3014"], [65118, 1, "\u3015"], [65119, 5, "#"], [65120, 5, "&"], [65121, 5, "*"], [65122, 5, "+"], [65123, 1, "-"], [65124, 5, "<"], [65125, 5, ">"], [65126, 5, "="], [65127, 3], [65128, 5, "\\"], [65129, 5, "$"], [65130, 5, "%"], [65131, 5, "@"], [[65132, 65135], 3], [65136, 5, " \u064B"], [65137, 1, "\u0640\u064B"], [65138, 5, " \u064C"], [65139, 2], [65140, 5, " \u064D"], [65141, 3], [65142, 5, " \u064E"], [65143, 1, "\u0640\u064E"], [65144, 5, " \u064F"], [65145, 1, "\u0640\u064F"], [65146, 5, " \u0650"], [65147, 1, "\u0640\u0650"], [65148, 5, " \u0651"], [65149, 1, "\u0640\u0651"], [65150, 5, " \u0652"], [65151, 1, "\u0640\u0652"], [65152, 1, "\u0621"], [[65153, 65154], 1, "\u0622"], [[65155, 65156], 1, "\u0623"], [[65157, 65158], 1, "\u0624"], [[65159, 65160], 1, "\u0625"], [[65161, 65164], 1, "\u0626"], [[65165, 65166], 1, "\u0627"], [[65167, 65170], 1, "\u0628"], [[65171, 65172], 1, "\u0629"], [[65173, 65176], 1, "\u062A"], [[65177, 65180], 1, "\u062B"], [[65181, 65184], 1, "\u062C"], [[65185, 65188], 1, "\u062D"], [[65189, 65192], 1, "\u062E"], [[65193, 65194], 1, "\u062F"], [[65195, 65196], 1, "\u0630"], [[65197, 65198], 1, "\u0631"], [[65199, 65200], 1, "\u0632"], [[65201, 65204], 1, "\u0633"], [[65205, 65208], 1, "\u0634"], [[65209, 65212], 1, "\u0635"], [[65213, 65216], 1, "\u0636"], [[65217, 65220], 1, "\u0637"], [[65221, 65224], 1, "\u0638"], [[65225, 65228], 1, "\u0639"], [[65229, 65232], 1, "\u063A"], [[65233, 65236], 1, "\u0641"], [[65237, 65240], 1, "\u0642"], [[65241, 65244], 1, "\u0643"], [[65245, 65248], 1, "\u0644"], [[65249, 65252], 1, "\u0645"], [[65253, 65256], 1, "\u0646"], [[65257, 65260], 1, "\u0647"], [[65261, 65262], 1, "\u0648"], [[65263, 65264], 1, "\u0649"], [[65265, 65268], 1, "\u064A"], [[65269, 65270], 1, "\u0644\u0622"], [[65271, 65272], 1, "\u0644\u0623"], [[65273, 65274], 1, "\u0644\u0625"], [[65275, 65276], 1, "\u0644\u0627"], [[65277, 65278], 3], [65279, 7], [65280, 3], [65281, 5, "!"], [65282, 5, '"'], [65283, 5, "#"], [65284, 5, "$"], [65285, 5, "%"], [65286, 5, "&"], [65287, 5, "'"], [65288, 5, "("], [65289, 5, ")"], [65290, 5, "*"], [65291, 5, "+"], [65292, 5, ","], [65293, 1, "-"], [65294, 1, "."], [65295, 5, "/"], [65296, 1, "0"], [65297, 1, "1"], [65298, 1, "2"], [65299, 1, "3"], [65300, 1, "4"], [65301, 1, "5"], [65302, 1, "6"], [65303, 1, "7"], [65304, 1, "8"], [65305, 1, "9"], [65306, 5, ":"], [65307, 5, ";"], [65308, 5, "<"], [65309, 5, "="], [65310, 5, ">"], [65311, 5, "?"], [65312, 5, "@"], [65313, 1, "a"], [65314, 1, "b"], [65315, 1, "c"], [65316, 1, "d"], [65317, 1, "e"], [65318, 1, "f"], [65319, 1, "g"], [65320, 1, "h"], [65321, 1, "i"], [65322, 1, "j"], [65323, 1, "k"], [65324, 1, "l"], [65325, 1, "m"], [65326, 1, "n"], [65327, 1, "o"], [65328, 1, "p"], [65329, 1, "q"], [65330, 1, "r"], [65331, 1, "s"], [65332, 1, "t"], [65333, 1, "u"], [65334, 1, "v"], [65335, 1, "w"], [65336, 1, "x"], [65337, 1, "y"], [65338, 1, "z"], [65339, 5, "["], [65340, 5, "\\"], [65341, 5, "]"], [65342, 5, "^"], [65343, 5, "_"], [65344, 5, "`"], [65345, 1, "a"], [65346, 1, "b"], [65347, 1, "c"], [65348, 1, "d"], [65349, 1, "e"], [65350, 1, "f"], [65351, 1, "g"], [65352, 1, "h"], [65353, 1, "i"], [65354, 1, "j"], [65355, 1, "k"], [65356, 1, "l"], [65357, 1, "m"], [65358, 1, "n"], [65359, 1, "o"], [65360, 1, "p"], [65361, 1, "q"], [65362, 1, "r"], [65363, 1, "s"], [65364, 1, "t"], [65365, 1, "u"], [65366, 1, "v"], [65367, 1, "w"], [65368, 1, "x"], [65369, 1, "y"], [65370, 1, "z"], [65371, 5, "{"], [65372, 5, "|"], [65373, 5, "}"], [65374, 5, "~"], [65375, 1, "\u2985"], [65376, 1, "\u2986"], [65377, 1, "."], [65378, 1, "\u300C"], [65379, 1, "\u300D"], [65380, 1, "\u3001"], [65381, 1, "\u30FB"], [65382, 1, "\u30F2"], [65383, 1, "\u30A1"], [65384, 1, "\u30A3"], [65385, 1, "\u30A5"], [65386, 1, "\u30A7"], [65387, 1, "\u30A9"], [65388, 1, "\u30E3"], [65389, 1, "\u30E5"], [65390, 1, "\u30E7"], [65391, 1, "\u30C3"], [65392, 1, "\u30FC"], [65393, 1, "\u30A2"], [65394, 1, "\u30A4"], [65395, 1, "\u30A6"], [65396, 1, "\u30A8"], [65397, 1, "\u30AA"], [65398, 1, "\u30AB"], [65399, 1, "\u30AD"], [65400, 1, "\u30AF"], [65401, 1, "\u30B1"], [65402, 1, "\u30B3"], [65403, 1, "\u30B5"], [65404, 1, "\u30B7"], [65405, 1, "\u30B9"], [65406, 1, "\u30BB"], [65407, 1, "\u30BD"], [65408, 1, "\u30BF"], [65409, 1, "\u30C1"], [65410, 1, "\u30C4"], [65411, 1, "\u30C6"], [65412, 1, "\u30C8"], [65413, 1, "\u30CA"], [65414, 1, "\u30CB"], [65415, 1, "\u30CC"], [65416, 1, "\u30CD"], [65417, 1, "\u30CE"], [65418, 1, "\u30CF"], [65419, 1, "\u30D2"], [65420, 1, "\u30D5"], [65421, 1, "\u30D8"], [65422, 1, "\u30DB"], [65423, 1, "\u30DE"], [65424, 1, "\u30DF"], [65425, 1, "\u30E0"], [65426, 1, "\u30E1"], [65427, 1, "\u30E2"], [65428, 1, "\u30E4"], [65429, 1, "\u30E6"], [65430, 1, "\u30E8"], [65431, 1, "\u30E9"], [65432, 1, "\u30EA"], [65433, 1, "\u30EB"], [65434, 1, "\u30EC"], [65435, 1, "\u30ED"], [65436, 1, "\u30EF"], [65437, 1, "\u30F3"], [65438, 1, "\u3099"], [65439, 1, "\u309A"], [65440, 3], [65441, 1, "\u1100"], [65442, 1, "\u1101"], [65443, 1, "\u11AA"], [65444, 1, "\u1102"], [65445, 1, "\u11AC"], [65446, 1, "\u11AD"], [65447, 1, "\u1103"], [65448, 1, "\u1104"], [65449, 1, "\u1105"], [65450, 1, "\u11B0"], [65451, 1, "\u11B1"], [65452, 1, "\u11B2"], [65453, 1, "\u11B3"], [65454, 1, "\u11B4"], [65455, 1, "\u11B5"], [65456, 1, "\u111A"], [65457, 1, "\u1106"], [65458, 1, "\u1107"], [65459, 1, "\u1108"], [65460, 1, "\u1121"], [65461, 1, "\u1109"], [65462, 1, "\u110A"], [65463, 1, "\u110B"], [65464, 1, "\u110C"], [65465, 1, "\u110D"], [65466, 1, "\u110E"], [65467, 1, "\u110F"], [65468, 1, "\u1110"], [65469, 1, "\u1111"], [65470, 1, "\u1112"], [[65471, 65473], 3], [65474, 1, "\u1161"], [65475, 1, "\u1162"], [65476, 1, "\u1163"], [65477, 1, "\u1164"], [65478, 1, "\u1165"], [65479, 1, "\u1166"], [[65480, 65481], 3], [65482, 1, "\u1167"], [65483, 1, "\u1168"], [65484, 1, "\u1169"], [65485, 1, "\u116A"], [65486, 1, "\u116B"], [65487, 1, "\u116C"], [[65488, 65489], 3], [65490, 1, "\u116D"], [65491, 1, "\u116E"], [65492, 1, "\u116F"], [65493, 1, "\u1170"], [65494, 1, "\u1171"], [65495, 1, "\u1172"], [[65496, 65497], 3], [65498, 1, "\u1173"], [65499, 1, "\u1174"], [65500, 1, "\u1175"], [[65501, 65503], 3], [65504, 1, "\xA2"], [65505, 1, "\xA3"], [65506, 1, "\xAC"], [65507, 5, " \u0304"], [65508, 1, "\xA6"], [65509, 1, "\xA5"], [65510, 1, "\u20A9"], [65511, 3], [65512, 1, "\u2502"], [65513, 1, "\u2190"], [65514, 1, "\u2191"], [65515, 1, "\u2192"], [65516, 1, "\u2193"], [65517, 1, "\u25A0"], [65518, 1, "\u25CB"], [[65519, 65528], 3], [[65529, 65531], 3], [65532, 3], [65533, 3], [[65534, 65535], 3], [[65536, 65547], 2], [65548, 3], [[65549, 65574], 2], [65575, 3], [[65576, 65594], 2], [65595, 3], [[65596, 65597], 2], [65598, 3], [[65599, 65613], 2], [[65614, 65615], 3], [[65616, 65629], 2], [[65630, 65663], 3], [[65664, 65786], 2], [[65787, 65791], 3], [[65792, 65794], 2], [[65795, 65798], 3], [[65799, 65843], 2], [[65844, 65846], 3], [[65847, 65855], 2], [[65856, 65930], 2], [[65931, 65932], 2], [[65933, 65934], 2], [65935, 3], [[65936, 65947], 2], [65948, 2], [[65949, 65951], 3], [65952, 2], [[65953, 65999], 3], [[66e3, 66044], 2], [66045, 2], [[66046, 66175], 3], [[66176, 66204], 2], [[66205, 66207], 3], [[66208, 66256], 2], [[66257, 66271], 3], [66272, 2], [[66273, 66299], 2], [[66300, 66303], 3], [[66304, 66334], 2], [66335, 2], [[66336, 66339], 2], [[66340, 66348], 3], [[66349, 66351], 2], [[66352, 66368], 2], [66369, 2], [[66370, 66377], 2], [66378, 2], [[66379, 66383], 3], [[66384, 66426], 2], [[66427, 66431], 3], [[66432, 66461], 2], [66462, 3], [66463, 2], [[66464, 66499], 2], [[66500, 66503], 3], [[66504, 66511], 2], [[66512, 66517], 2], [[66518, 66559], 3], [66560, 1, "\u{10428}"], [66561, 1, "\u{10429}"], [66562, 1, "\u{1042A}"], [66563, 1, "\u{1042B}"], [66564, 1, "\u{1042C}"], [66565, 1, "\u{1042D}"], [66566, 1, "\u{1042E}"], [66567, 1, "\u{1042F}"], [66568, 1, "\u{10430}"], [66569, 1, "\u{10431}"], [66570, 1, "\u{10432}"], [66571, 1, "\u{10433}"], [66572, 1, "\u{10434}"], [66573, 1, "\u{10435}"], [66574, 1, "\u{10436}"], [66575, 1, "\u{10437}"], [66576, 1, "\u{10438}"], [66577, 1, "\u{10439}"], [66578, 1, "\u{1043A}"], [66579, 1, "\u{1043B}"], [66580, 1, "\u{1043C}"], [66581, 1, "\u{1043D}"], [66582, 1, "\u{1043E}"], [66583, 1, "\u{1043F}"], [66584, 1, "\u{10440}"], [66585, 1, "\u{10441}"], [66586, 1, "\u{10442}"], [66587, 1, "\u{10443}"], [66588, 1, "\u{10444}"], [66589, 1, "\u{10445}"], [66590, 1, "\u{10446}"], [66591, 1, "\u{10447}"], [66592, 1, "\u{10448}"], [66593, 1, "\u{10449}"], [66594, 1, "\u{1044A}"], [66595, 1, "\u{1044B}"], [66596, 1, "\u{1044C}"], [66597, 1, "\u{1044D}"], [66598, 1, "\u{1044E}"], [66599, 1, "\u{1044F}"], [[66600, 66637], 2], [[66638, 66717], 2], [[66718, 66719], 3], [[66720, 66729], 2], [[66730, 66735], 3], [66736, 1, "\u{104D8}"], [66737, 1, "\u{104D9}"], [66738, 1, "\u{104DA}"], [66739, 1, "\u{104DB}"], [66740, 1, "\u{104DC}"], [66741, 1, "\u{104DD}"], [66742, 1, "\u{104DE}"], [66743, 1, "\u{104DF}"], [66744, 1, "\u{104E0}"], [66745, 1, "\u{104E1}"], [66746, 1, "\u{104E2}"], [66747, 1, "\u{104E3}"], [66748, 1, "\u{104E4}"], [66749, 1, "\u{104E5}"], [66750, 1, "\u{104E6}"], [66751, 1, "\u{104E7}"], [66752, 1, "\u{104E8}"], [66753, 1, "\u{104E9}"], [66754, 1, "\u{104EA}"], [66755, 1, "\u{104EB}"], [66756, 1, "\u{104EC}"], [66757, 1, "\u{104ED}"], [66758, 1, "\u{104EE}"], [66759, 1, "\u{104EF}"], [66760, 1, "\u{104F0}"], [66761, 1, "\u{104F1}"], [66762, 1, "\u{104F2}"], [66763, 1, "\u{104F3}"], [66764, 1, "\u{104F4}"], [66765, 1, "\u{104F5}"], [66766, 1, "\u{104F6}"], [66767, 1, "\u{104F7}"], [66768, 1, "\u{104F8}"], [66769, 1, "\u{104F9}"], [66770, 1, "\u{104FA}"], [66771, 1, "\u{104FB}"], [[66772, 66775], 3], [[66776, 66811], 2], [[66812, 66815], 3], [[66816, 66855], 2], [[66856, 66863], 3], [[66864, 66915], 2], [[66916, 66926], 3], [66927, 2], [66928, 1, "\u{10597}"], [66929, 1, "\u{10598}"], [66930, 1, "\u{10599}"], [66931, 1, "\u{1059A}"], [66932, 1, "\u{1059B}"], [66933, 1, "\u{1059C}"], [66934, 1, "\u{1059D}"], [66935, 1, "\u{1059E}"], [66936, 1, "\u{1059F}"], [66937, 1, "\u{105A0}"], [66938, 1, "\u{105A1}"], [66939, 3], [66940, 1, "\u{105A3}"], [66941, 1, "\u{105A4}"], [66942, 1, "\u{105A5}"], [66943, 1, "\u{105A6}"], [66944, 1, "\u{105A7}"], [66945, 1, "\u{105A8}"], [66946, 1, "\u{105A9}"], [66947, 1, "\u{105AA}"], [66948, 1, "\u{105AB}"], [66949, 1, "\u{105AC}"], [66950, 1, "\u{105AD}"], [66951, 1, "\u{105AE}"], [66952, 1, "\u{105AF}"], [66953, 1, "\u{105B0}"], [66954, 1, "\u{105B1}"], [66955, 3], [66956, 1, "\u{105B3}"], [66957, 1, "\u{105B4}"], [66958, 1, "\u{105B5}"], [66959, 1, "\u{105B6}"], [66960, 1, "\u{105B7}"], [66961, 1, "\u{105B8}"], [66962, 1, "\u{105B9}"], [66963, 3], [66964, 1, "\u{105BB}"], [66965, 1, "\u{105BC}"], [66966, 3], [[66967, 66977], 2], [66978, 3], [[66979, 66993], 2], [66994, 3], [[66995, 67001], 2], [67002, 3], [[67003, 67004], 2], [[67005, 67071], 3], [[67072, 67382], 2], [[67383, 67391], 3], [[67392, 67413], 2], [[67414, 67423], 3], [[67424, 67431], 2], [[67432, 67455], 3], [67456, 2], [67457, 1, "\u02D0"], [67458, 1, "\u02D1"], [67459, 1, "\xE6"], [67460, 1, "\u0299"], [67461, 1, "\u0253"], [67462, 3], [67463, 1, "\u02A3"], [67464, 1, "\uAB66"], [67465, 1, "\u02A5"], [67466, 1, "\u02A4"], [67467, 1, "\u0256"], [67468, 1, "\u0257"], [67469, 1, "\u1D91"], [67470, 1, "\u0258"], [67471, 1, "\u025E"], [67472, 1, "\u02A9"], [67473, 1, "\u0264"], [67474, 1, "\u0262"], [67475, 1, "\u0260"], [67476, 1, "\u029B"], [67477, 1, "\u0127"], [67478, 1, "\u029C"], [67479, 1, "\u0267"], [67480, 1, "\u0284"], [67481, 1, "\u02AA"], [67482, 1, "\u02AB"], [67483, 1, "\u026C"], [67484, 1, "\u{1DF04}"], [67485, 1, "\uA78E"], [67486, 1, "\u026E"], [67487, 1, "\u{1DF05}"], [67488, 1, "\u028E"], [67489, 1, "\u{1DF06}"], [67490, 1, "\xF8"], [67491, 1, "\u0276"], [67492, 1, "\u0277"], [67493, 1, "q"], [67494, 1, "\u027A"], [67495, 1, "\u{1DF08}"], [67496, 1, "\u027D"], [67497, 1, "\u027E"], [67498, 1, "\u0280"], [67499, 1, "\u02A8"], [67500, 1, "\u02A6"], [67501, 1, "\uAB67"], [67502, 1, "\u02A7"], [67503, 1, "\u0288"], [67504, 1, "\u2C71"], [67505, 3], [67506, 1, "\u028F"], [67507, 1, "\u02A1"], [67508, 1, "\u02A2"], [67509, 1, "\u0298"], [67510, 1, "\u01C0"], [67511, 1, "\u01C1"], [67512, 1, "\u01C2"], [67513, 1, "\u{1DF0A}"], [67514, 1, "\u{1DF1E}"], [[67515, 67583], 3], [[67584, 67589], 2], [[67590, 67591], 3], [67592, 2], [67593, 3], [[67594, 67637], 2], [67638, 3], [[67639, 67640], 2], [[67641, 67643], 3], [67644, 2], [[67645, 67646], 3], [67647, 2], [[67648, 67669], 2], [67670, 3], [[67671, 67679], 2], [[67680, 67702], 2], [[67703, 67711], 2], [[67712, 67742], 2], [[67743, 67750], 3], [[67751, 67759], 2], [[67760, 67807], 3], [[67808, 67826], 2], [67827, 3], [[67828, 67829], 2], [[67830, 67834], 3], [[67835, 67839], 2], [[67840, 67861], 2], [[67862, 67865], 2], [[67866, 67867], 2], [[67868, 67870], 3], [67871, 2], [[67872, 67897], 2], [[67898, 67902], 3], [67903, 2], [[67904, 67967], 3], [[67968, 68023], 2], [[68024, 68027], 3], [[68028, 68029], 2], [[68030, 68031], 2], [[68032, 68047], 2], [[68048, 68049], 3], [[68050, 68095], 2], [[68096, 68099], 2], [68100, 3], [[68101, 68102], 2], [[68103, 68107], 3], [[68108, 68115], 2], [68116, 3], [[68117, 68119], 2], [68120, 3], [[68121, 68147], 2], [[68148, 68149], 2], [[68150, 68151], 3], [[68152, 68154], 2], [[68155, 68158], 3], [68159, 2], [[68160, 68167], 2], [68168, 2], [[68169, 68175], 3], [[68176, 68184], 2], [[68185, 68191], 3], [[68192, 68220], 2], [[68221, 68223], 2], [[68224, 68252], 2], [[68253, 68255], 2], [[68256, 68287], 3], [[68288, 68295], 2], [68296, 2], [[68297, 68326], 2], [[68327, 68330], 3], [[68331, 68342], 2], [[68343, 68351], 3], [[68352, 68405], 2], [[68406, 68408], 3], [[68409, 68415], 2], [[68416, 68437], 2], [[68438, 68439], 3], [[68440, 68447], 2], [[68448, 68466], 2], [[68467, 68471], 3], [[68472, 68479], 2], [[68480, 68497], 2], [[68498, 68504], 3], [[68505, 68508], 2], [[68509, 68520], 3], [[68521, 68527], 2], [[68528, 68607], 3], [[68608, 68680], 2], [[68681, 68735], 3], [68736, 1, "\u{10CC0}"], [68737, 1, "\u{10CC1}"], [68738, 1, "\u{10CC2}"], [68739, 1, "\u{10CC3}"], [68740, 1, "\u{10CC4}"], [68741, 1, "\u{10CC5}"], [68742, 1, "\u{10CC6}"], [68743, 1, "\u{10CC7}"], [68744, 1, "\u{10CC8}"], [68745, 1, "\u{10CC9}"], [68746, 1, "\u{10CCA}"], [68747, 1, "\u{10CCB}"], [68748, 1, "\u{10CCC}"], [68749, 1, "\u{10CCD}"], [68750, 1, "\u{10CCE}"], [68751, 1, "\u{10CCF}"], [68752, 1, "\u{10CD0}"], [68753, 1, "\u{10CD1}"], [68754, 1, "\u{10CD2}"], [68755, 1, "\u{10CD3}"], [68756, 1, "\u{10CD4}"], [68757, 1, "\u{10CD5}"], [68758, 1, "\u{10CD6}"], [68759, 1, "\u{10CD7}"], [68760, 1, "\u{10CD8}"], [68761, 1, "\u{10CD9}"], [68762, 1, "\u{10CDA}"], [68763, 1, "\u{10CDB}"], [68764, 1, "\u{10CDC}"], [68765, 1, "\u{10CDD}"], [68766, 1, "\u{10CDE}"], [68767, 1, "\u{10CDF}"], [68768, 1, "\u{10CE0}"], [68769, 1, "\u{10CE1}"], [68770, 1, "\u{10CE2}"], [68771, 1, "\u{10CE3}"], [68772, 1, "\u{10CE4}"], [68773, 1, "\u{10CE5}"], [68774, 1, "\u{10CE6}"], [68775, 1, "\u{10CE7}"], [68776, 1, "\u{10CE8}"], [68777, 1, "\u{10CE9}"], [68778, 1, "\u{10CEA}"], [68779, 1, "\u{10CEB}"], [68780, 1, "\u{10CEC}"], [68781, 1, "\u{10CED}"], [68782, 1, "\u{10CEE}"], [68783, 1, "\u{10CEF}"], [68784, 1, "\u{10CF0}"], [68785, 1, "\u{10CF1}"], [68786, 1, "\u{10CF2}"], [[68787, 68799], 3], [[68800, 68850], 2], [[68851, 68857], 3], [[68858, 68863], 2], [[68864, 68903], 2], [[68904, 68911], 3], [[68912, 68921], 2], [[68922, 69215], 3], [[69216, 69246], 2], [69247, 3], [[69248, 69289], 2], [69290, 3], [[69291, 69292], 2], [69293, 2], [[69294, 69295], 3], [[69296, 69297], 2], [[69298, 69375], 3], [[69376, 69404], 2], [[69405, 69414], 2], [69415, 2], [[69416, 69423], 3], [[69424, 69456], 2], [[69457, 69465], 2], [[69466, 69487], 3], [[69488, 69509], 2], [[69510, 69513], 2], [[69514, 69551], 3], [[69552, 69572], 2], [[69573, 69579], 2], [[69580, 69599], 3], [[69600, 69622], 2], [[69623, 69631], 3], [[69632, 69702], 2], [[69703, 69709], 2], [[69710, 69713], 3], [[69714, 69733], 2], [[69734, 69743], 2], [[69744, 69749], 2], [[69750, 69758], 3], [69759, 2], [[69760, 69818], 2], [[69819, 69820], 2], [69821, 3], [[69822, 69825], 2], [69826, 2], [[69827, 69836], 3], [69837, 3], [[69838, 69839], 3], [[69840, 69864], 2], [[69865, 69871], 3], [[69872, 69881], 2], [[69882, 69887], 3], [[69888, 69940], 2], [69941, 3], [[69942, 69951], 2], [[69952, 69955], 2], [[69956, 69958], 2], [69959, 2], [[69960, 69967], 3], [[69968, 70003], 2], [[70004, 70005], 2], [70006, 2], [[70007, 70015], 3], [[70016, 70084], 2], [[70085, 70088], 2], [[70089, 70092], 2], [70093, 2], [[70094, 70095], 2], [[70096, 70105], 2], [70106, 2], [70107, 2], [70108, 2], [[70109, 70111], 2], [70112, 3], [[70113, 70132], 2], [[70133, 70143], 3], [[70144, 70161], 2], [70162, 3], [[70163, 70199], 2], [[70200, 70205], 2], [70206, 2], [[70207, 70271], 3], [[70272, 70278], 2], [70279, 3], [70280, 2], [70281, 3], [[70282, 70285], 2], [70286, 3], [[70287, 70301], 2], [70302, 3], [[70303, 70312], 2], [70313, 2], [[70314, 70319], 3], [[70320, 70378], 2], [[70379, 70383], 3], [[70384, 70393], 2], [[70394, 70399], 3], [70400, 2], [[70401, 70403], 2], [70404, 3], [[70405, 70412], 2], [[70413, 70414], 3], [[70415, 70416], 2], [[70417, 70418], 3], [[70419, 70440], 2], [70441, 3], [[70442, 70448], 2], [70449, 3], [[70450, 70451], 2], [70452, 3], [[70453, 70457], 2], [70458, 3], [70459, 2], [[70460, 70468], 2], [[70469, 70470], 3], [[70471, 70472], 2], [[70473, 70474], 3], [[70475, 70477], 2], [[70478, 70479], 3], [70480, 2], [[70481, 70486], 3], [70487, 2], [[70488, 70492], 3], [[70493, 70499], 2], [[70500, 70501], 3], [[70502, 70508], 2], [[70509, 70511], 3], [[70512, 70516], 2], [[70517, 70655], 3], [[70656, 70730], 2], [[70731, 70735], 2], [[70736, 70745], 2], [70746, 2], [70747, 2], [70748, 3], [70749, 2], [70750, 2], [70751, 2], [[70752, 70753], 2], [[70754, 70783], 3], [[70784, 70853], 2], [70854, 2], [70855, 2], [[70856, 70863], 3], [[70864, 70873], 2], [[70874, 71039], 3], [[71040, 71093], 2], [[71094, 71095], 3], [[71096, 71104], 2], [[71105, 71113], 2], [[71114, 71127], 2], [[71128, 71133], 2], [[71134, 71167], 3], [[71168, 71232], 2], [[71233, 71235], 2], [71236, 2], [[71237, 71247], 3], [[71248, 71257], 2], [[71258, 71263], 3], [[71264, 71276], 2], [[71277, 71295], 3], [[71296, 71351], 2], [71352, 2], [71353, 2], [[71354, 71359], 3], [[71360, 71369], 2], [[71370, 71423], 3], [[71424, 71449], 2], [71450, 2], [[71451, 71452], 3], [[71453, 71467], 2], [[71468, 71471], 3], [[71472, 71481], 2], [[71482, 71487], 2], [[71488, 71494], 2], [[71495, 71679], 3], [[71680, 71738], 2], [71739, 2], [[71740, 71839], 3], [71840, 1, "\u{118C0}"], [71841, 1, "\u{118C1}"], [71842, 1, "\u{118C2}"], [71843, 1, "\u{118C3}"], [71844, 1, "\u{118C4}"], [71845, 1, "\u{118C5}"], [71846, 1, "\u{118C6}"], [71847, 1, "\u{118C7}"], [71848, 1, "\u{118C8}"], [71849, 1, "\u{118C9}"], [71850, 1, "\u{118CA}"], [71851, 1, "\u{118CB}"], [71852, 1, "\u{118CC}"], [71853, 1, "\u{118CD}"], [71854, 1, "\u{118CE}"], [71855, 1, "\u{118CF}"], [71856, 1, "\u{118D0}"], [71857, 1, "\u{118D1}"], [71858, 1, "\u{118D2}"], [71859, 1, "\u{118D3}"], [71860, 1, "\u{118D4}"], [71861, 1, "\u{118D5}"], [71862, 1, "\u{118D6}"], [71863, 1, "\u{118D7}"], [71864, 1, "\u{118D8}"], [71865, 1, "\u{118D9}"], [71866, 1, "\u{118DA}"], [71867, 1, "\u{118DB}"], [71868, 1, "\u{118DC}"], [71869, 1, "\u{118DD}"], [71870, 1, "\u{118DE}"], [71871, 1, "\u{118DF}"], [[71872, 71913], 2], [[71914, 71922], 2], [[71923, 71934], 3], [71935, 2], [[71936, 71942], 2], [[71943, 71944], 3], [71945, 2], [[71946, 71947], 3], [[71948, 71955], 2], [71956, 3], [[71957, 71958], 2], [71959, 3], [[71960, 71989], 2], [71990, 3], [[71991, 71992], 2], [[71993, 71994], 3], [[71995, 72003], 2], [[72004, 72006], 2], [[72007, 72015], 3], [[72016, 72025], 2], [[72026, 72095], 3], [[72096, 72103], 2], [[72104, 72105], 3], [[72106, 72151], 2], [[72152, 72153], 3], [[72154, 72161], 2], [72162, 2], [[72163, 72164], 2], [[72165, 72191], 3], [[72192, 72254], 2], [[72255, 72262], 2], [72263, 2], [[72264, 72271], 3], [[72272, 72323], 2], [[72324, 72325], 2], [[72326, 72345], 2], [[72346, 72348], 2], [72349, 2], [[72350, 72354], 2], [[72355, 72367], 3], [[72368, 72383], 2], [[72384, 72440], 2], [[72441, 72703], 3], [[72704, 72712], 2], [72713, 3], [[72714, 72758], 2], [72759, 3], [[72760, 72768], 2], [[72769, 72773], 2], [[72774, 72783], 3], [[72784, 72793], 2], [[72794, 72812], 2], [[72813, 72815], 3], [[72816, 72817], 2], [[72818, 72847], 2], [[72848, 72849], 3], [[72850, 72871], 2], [72872, 3], [[72873, 72886], 2], [[72887, 72959], 3], [[72960, 72966], 2], [72967, 3], [[72968, 72969], 2], [72970, 3], [[72971, 73014], 2], [[73015, 73017], 3], [73018, 2], [73019, 3], [[73020, 73021], 2], [73022, 3], [[73023, 73031], 2], [[73032, 73039], 3], [[73040, 73049], 2], [[73050, 73055], 3], [[73056, 73061], 2], [73062, 3], [[73063, 73064], 2], [73065, 3], [[73066, 73102], 2], [73103, 3], [[73104, 73105], 2], [73106, 3], [[73107, 73112], 2], [[73113, 73119], 3], [[73120, 73129], 2], [[73130, 73439], 3], [[73440, 73462], 2], [[73463, 73464], 2], [[73465, 73647], 3], [73648, 2], [[73649, 73663], 3], [[73664, 73713], 2], [[73714, 73726], 3], [73727, 2], [[73728, 74606], 2], [[74607, 74648], 2], [74649, 2], [[74650, 74751], 3], [[74752, 74850], 2], [[74851, 74862], 2], [74863, 3], [[74864, 74867], 2], [74868, 2], [[74869, 74879], 3], [[74880, 75075], 2], [[75076, 77711], 3], [[77712, 77808], 2], [[77809, 77810], 2], [[77811, 77823], 3], [[77824, 78894], 2], [78895, 3], [[78896, 78904], 3], [[78905, 82943], 3], [[82944, 83526], 2], [[83527, 92159], 3], [[92160, 92728], 2], [[92729, 92735], 3], [[92736, 92766], 2], [92767, 3], [[92768, 92777], 2], [[92778, 92781], 3], [[92782, 92783], 2], [[92784, 92862], 2], [92863, 3], [[92864, 92873], 2], [[92874, 92879], 3], [[92880, 92909], 2], [[92910, 92911], 3], [[92912, 92916], 2], [92917, 2], [[92918, 92927], 3], [[92928, 92982], 2], [[92983, 92991], 2], [[92992, 92995], 2], [[92996, 92997], 2], [[92998, 93007], 3], [[93008, 93017], 2], [93018, 3], [[93019, 93025], 2], [93026, 3], [[93027, 93047], 2], [[93048, 93052], 3], [[93053, 93071], 2], [[93072, 93759], 3], [93760, 1, "\u{16E60}"], [93761, 1, "\u{16E61}"], [93762, 1, "\u{16E62}"], [93763, 1, "\u{16E63}"], [93764, 1, "\u{16E64}"], [93765, 1, "\u{16E65}"], [93766, 1, "\u{16E66}"], [93767, 1, "\u{16E67}"], [93768, 1, "\u{16E68}"], [93769, 1, "\u{16E69}"], [93770, 1, "\u{16E6A}"], [93771, 1, "\u{16E6B}"], [93772, 1, "\u{16E6C}"], [93773, 1, "\u{16E6D}"], [93774, 1, "\u{16E6E}"], [93775, 1, "\u{16E6F}"], [93776, 1, "\u{16E70}"], [93777, 1, "\u{16E71}"], [93778, 1, "\u{16E72}"], [93779, 1, "\u{16E73}"], [93780, 1, "\u{16E74}"], [93781, 1, "\u{16E75}"], [93782, 1, "\u{16E76}"], [93783, 1, "\u{16E77}"], [93784, 1, "\u{16E78}"], [93785, 1, "\u{16E79}"], [93786, 1, "\u{16E7A}"], [93787, 1, "\u{16E7B}"], [93788, 1, "\u{16E7C}"], [93789, 1, "\u{16E7D}"], [93790, 1, "\u{16E7E}"], [93791, 1, "\u{16E7F}"], [[93792, 93823], 2], [[93824, 93850], 2], [[93851, 93951], 3], [[93952, 94020], 2], [[94021, 94026], 2], [[94027, 94030], 3], [94031, 2], [[94032, 94078], 2], [[94079, 94087], 2], [[94088, 94094], 3], [[94095, 94111], 2], [[94112, 94175], 3], [94176, 2], [94177, 2], [94178, 2], [94179, 2], [94180, 2], [[94181, 94191], 3], [[94192, 94193], 2], [[94194, 94207], 3], [[94208, 100332], 2], [[100333, 100337], 2], [[100338, 100343], 2], [[100344, 100351], 3], [[100352, 101106], 2], [[101107, 101589], 2], [[101590, 101631], 3], [[101632, 101640], 2], [[101641, 110575], 3], [[110576, 110579], 2], [110580, 3], [[110581, 110587], 2], [110588, 3], [[110589, 110590], 2], [110591, 3], [[110592, 110593], 2], [[110594, 110878], 2], [[110879, 110882], 2], [[110883, 110927], 3], [[110928, 110930], 2], [[110931, 110947], 3], [[110948, 110951], 2], [[110952, 110959], 3], [[110960, 111355], 2], [[111356, 113663], 3], [[113664, 113770], 2], [[113771, 113775], 3], [[113776, 113788], 2], [[113789, 113791], 3], [[113792, 113800], 2], [[113801, 113807], 3], [[113808, 113817], 2], [[113818, 113819], 3], [113820, 2], [[113821, 113822], 2], [113823, 2], [[113824, 113827], 7], [[113828, 118527], 3], [[118528, 118573], 2], [[118574, 118575], 3], [[118576, 118598], 2], [[118599, 118607], 3], [[118608, 118723], 2], [[118724, 118783], 3], [[118784, 119029], 2], [[119030, 119039], 3], [[119040, 119078], 2], [[119079, 119080], 3], [119081, 2], [[119082, 119133], 2], [119134, 1, "\u{1D157}\u{1D165}"], [119135, 1, "\u{1D158}\u{1D165}"], [119136, 1, "\u{1D158}\u{1D165}\u{1D16E}"], [119137, 1, "\u{1D158}\u{1D165}\u{1D16F}"], [119138, 1, "\u{1D158}\u{1D165}\u{1D170}"], [119139, 1, "\u{1D158}\u{1D165}\u{1D171}"], [119140, 1, "\u{1D158}\u{1D165}\u{1D172}"], [[119141, 119154], 2], [[119155, 119162], 3], [[119163, 119226], 2], [119227, 1, "\u{1D1B9}\u{1D165}"], [119228, 1, "\u{1D1BA}\u{1D165}"], [119229, 1, "\u{1D1B9}\u{1D165}\u{1D16E}"], [119230, 1, "\u{1D1BA}\u{1D165}\u{1D16E}"], [119231, 1, "\u{1D1B9}\u{1D165}\u{1D16F}"], [119232, 1, "\u{1D1BA}\u{1D165}\u{1D16F}"], [[119233, 119261], 2], [[119262, 119272], 2], [[119273, 119274], 2], [[119275, 119295], 3], [[119296, 119365], 2], [[119366, 119519], 3], [[119520, 119539], 2], [[119540, 119551], 3], [[119552, 119638], 2], [[119639, 119647], 3], [[119648, 119665], 2], [[119666, 119672], 2], [[119673, 119807], 3], [119808, 1, "a"], [119809, 1, "b"], [119810, 1, "c"], [119811, 1, "d"], [119812, 1, "e"], [119813, 1, "f"], [119814, 1, "g"], [119815, 1, "h"], [119816, 1, "i"], [119817, 1, "j"], [119818, 1, "k"], [119819, 1, "l"], [119820, 1, "m"], [119821, 1, "n"], [119822, 1, "o"], [119823, 1, "p"], [119824, 1, "q"], [119825, 1, "r"], [119826, 1, "s"], [119827, 1, "t"], [119828, 1, "u"], [119829, 1, "v"], [119830, 1, "w"], [119831, 1, "x"], [119832, 1, "y"], [119833, 1, "z"], [119834, 1, "a"], [119835, 1, "b"], [119836, 1, "c"], [119837, 1, "d"], [119838, 1, "e"], [119839, 1, "f"], [119840, 1, "g"], [119841, 1, "h"], [119842, 1, "i"], [119843, 1, "j"], [119844, 1, "k"], [119845, 1, "l"], [119846, 1, "m"], [119847, 1, "n"], [119848, 1, "o"], [119849, 1, "p"], [119850, 1, "q"], [119851, 1, "r"], [119852, 1, "s"], [119853, 1, "t"], [119854, 1, "u"], [119855, 1, "v"], [119856, 1, "w"], [119857, 1, "x"], [119858, 1, "y"], [119859, 1, "z"], [119860, 1, "a"], [119861, 1, "b"], [119862, 1, "c"], [119863, 1, "d"], [119864, 1, "e"], [119865, 1, "f"], [119866, 1, "g"], [119867, 1, "h"], [119868, 1, "i"], [119869, 1, "j"], [119870, 1, "k"], [119871, 1, "l"], [119872, 1, "m"], [119873, 1, "n"], [119874, 1, "o"], [119875, 1, "p"], [119876, 1, "q"], [119877, 1, "r"], [119878, 1, "s"], [119879, 1, "t"], [119880, 1, "u"], [119881, 1, "v"], [119882, 1, "w"], [119883, 1, "x"], [119884, 1, "y"], [119885, 1, "z"], [119886, 1, "a"], [119887, 1, "b"], [119888, 1, "c"], [119889, 1, "d"], [119890, 1, "e"], [119891, 1, "f"], [119892, 1, "g"], [119893, 3], [119894, 1, "i"], [119895, 1, "j"], [119896, 1, "k"], [119897, 1, "l"], [119898, 1, "m"], [119899, 1, "n"], [119900, 1, "o"], [119901, 1, "p"], [119902, 1, "q"], [119903, 1, "r"], [119904, 1, "s"], [119905, 1, "t"], [119906, 1, "u"], [119907, 1, "v"], [119908, 1, "w"], [119909, 1, "x"], [119910, 1, "y"], [119911, 1, "z"], [119912, 1, "a"], [119913, 1, "b"], [119914, 1, "c"], [119915, 1, "d"], [119916, 1, "e"], [119917, 1, "f"], [119918, 1, "g"], [119919, 1, "h"], [119920, 1, "i"], [119921, 1, "j"], [119922, 1, "k"], [119923, 1, "l"], [119924, 1, "m"], [119925, 1, "n"], [119926, 1, "o"], [119927, 1, "p"], [119928, 1, "q"], [119929, 1, "r"], [119930, 1, "s"], [119931, 1, "t"], [119932, 1, "u"], [119933, 1, "v"], [119934, 1, "w"], [119935, 1, "x"], [119936, 1, "y"], [119937, 1, "z"], [119938, 1, "a"], [119939, 1, "b"], [119940, 1, "c"], [119941, 1, "d"], [119942, 1, "e"], [119943, 1, "f"], [119944, 1, "g"], [119945, 1, "h"], [119946, 1, "i"], [119947, 1, "j"], [119948, 1, "k"], [119949, 1, "l"], [119950, 1, "m"], [119951, 1, "n"], [119952, 1, "o"], [119953, 1, "p"], [119954, 1, "q"], [119955, 1, "r"], [119956, 1, "s"], [119957, 1, "t"], [119958, 1, "u"], [119959, 1, "v"], [119960, 1, "w"], [119961, 1, "x"], [119962, 1, "y"], [119963, 1, "z"], [119964, 1, "a"], [119965, 3], [119966, 1, "c"], [119967, 1, "d"], [[119968, 119969], 3], [119970, 1, "g"], [[119971, 119972], 3], [119973, 1, "j"], [119974, 1, "k"], [[119975, 119976], 3], [119977, 1, "n"], [119978, 1, "o"], [119979, 1, "p"], [119980, 1, "q"], [119981, 3], [119982, 1, "s"], [119983, 1, "t"], [119984, 1, "u"], [119985, 1, "v"], [119986, 1, "w"], [119987, 1, "x"], [119988, 1, "y"], [119989, 1, "z"], [119990, 1, "a"], [119991, 1, "b"], [119992, 1, "c"], [119993, 1, "d"], [119994, 3], [119995, 1, "f"], [119996, 3], [119997, 1, "h"], [119998, 1, "i"], [119999, 1, "j"], [12e4, 1, "k"], [120001, 1, "l"], [120002, 1, "m"], [120003, 1, "n"], [120004, 3], [120005, 1, "p"], [120006, 1, "q"], [120007, 1, "r"], [120008, 1, "s"], [120009, 1, "t"], [120010, 1, "u"], [120011, 1, "v"], [120012, 1, "w"], [120013, 1, "x"], [120014, 1, "y"], [120015, 1, "z"], [120016, 1, "a"], [120017, 1, "b"], [120018, 1, "c"], [120019, 1, "d"], [120020, 1, "e"], [120021, 1, "f"], [120022, 1, "g"], [120023, 1, "h"], [120024, 1, "i"], [120025, 1, "j"], [120026, 1, "k"], [120027, 1, "l"], [120028, 1, "m"], [120029, 1, "n"], [120030, 1, "o"], [120031, 1, "p"], [120032, 1, "q"], [120033, 1, "r"], [120034, 1, "s"], [120035, 1, "t"], [120036, 1, "u"], [120037, 1, "v"], [120038, 1, "w"], [120039, 1, "x"], [120040, 1, "y"], [120041, 1, "z"], [120042, 1, "a"], [120043, 1, "b"], [120044, 1, "c"], [120045, 1, "d"], [120046, 1, "e"], [120047, 1, "f"], [120048, 1, "g"], [120049, 1, "h"], [120050, 1, "i"], [120051, 1, "j"], [120052, 1, "k"], [120053, 1, "l"], [120054, 1, "m"], [120055, 1, "n"], [120056, 1, "o"], [120057, 1, "p"], [120058, 1, "q"], [120059, 1, "r"], [120060, 1, "s"], [120061, 1, "t"], [120062, 1, "u"], [120063, 1, "v"], [120064, 1, "w"], [120065, 1, "x"], [120066, 1, "y"], [120067, 1, "z"], [120068, 1, "a"], [120069, 1, "b"], [120070, 3], [120071, 1, "d"], [120072, 1, "e"], [120073, 1, "f"], [120074, 1, "g"], [[120075, 120076], 3], [120077, 1, "j"], [120078, 1, "k"], [120079, 1, "l"], [120080, 1, "m"], [120081, 1, "n"], [120082, 1, "o"], [120083, 1, "p"], [120084, 1, "q"], [120085, 3], [120086, 1, "s"], [120087, 1, "t"], [120088, 1, "u"], [120089, 1, "v"], [120090, 1, "w"], [120091, 1, "x"], [120092, 1, "y"], [120093, 3], [120094, 1, "a"], [120095, 1, "b"], [120096, 1, "c"], [120097, 1, "d"], [120098, 1, "e"], [120099, 1, "f"], [120100, 1, "g"], [120101, 1, "h"], [120102, 1, "i"], [120103, 1, "j"], [120104, 1, "k"], [120105, 1, "l"], [120106, 1, "m"], [120107, 1, "n"], [120108, 1, "o"], [120109, 1, "p"], [120110, 1, "q"], [120111, 1, "r"], [120112, 1, "s"], [120113, 1, "t"], [120114, 1, "u"], [120115, 1, "v"], [120116, 1, "w"], [120117, 1, "x"], [120118, 1, "y"], [120119, 1, "z"], [120120, 1, "a"], [120121, 1, "b"], [120122, 3], [120123, 1, "d"], [120124, 1, "e"], [120125, 1, "f"], [120126, 1, "g"], [120127, 3], [120128, 1, "i"], [120129, 1, "j"], [120130, 1, "k"], [120131, 1, "l"], [120132, 1, "m"], [120133, 3], [120134, 1, "o"], [[120135, 120137], 3], [120138, 1, "s"], [120139, 1, "t"], [120140, 1, "u"], [120141, 1, "v"], [120142, 1, "w"], [120143, 1, "x"], [120144, 1, "y"], [120145, 3], [120146, 1, "a"], [120147, 1, "b"], [120148, 1, "c"], [120149, 1, "d"], [120150, 1, "e"], [120151, 1, "f"], [120152, 1, "g"], [120153, 1, "h"], [120154, 1, "i"], [120155, 1, "j"], [120156, 1, "k"], [120157, 1, "l"], [120158, 1, "m"], [120159, 1, "n"], [120160, 1, "o"], [120161, 1, "p"], [120162, 1, "q"], [120163, 1, "r"], [120164, 1, "s"], [120165, 1, "t"], [120166, 1, "u"], [120167, 1, "v"], [120168, 1, "w"], [120169, 1, "x"], [120170, 1, "y"], [120171, 1, "z"], [120172, 1, "a"], [120173, 1, "b"], [120174, 1, "c"], [120175, 1, "d"], [120176, 1, "e"], [120177, 1, "f"], [120178, 1, "g"], [120179, 1, "h"], [120180, 1, "i"], [120181, 1, "j"], [120182, 1, "k"], [120183, 1, "l"], [120184, 1, "m"], [120185, 1, "n"], [120186, 1, "o"], [120187, 1, "p"], [120188, 1, "q"], [120189, 1, "r"], [120190, 1, "s"], [120191, 1, "t"], [120192, 1, "u"], [120193, 1, "v"], [120194, 1, "w"], [120195, 1, "x"], [120196, 1, "y"], [120197, 1, "z"], [120198, 1, "a"], [120199, 1, "b"], [120200, 1, "c"], [120201, 1, "d"], [120202, 1, "e"], [120203, 1, "f"], [120204, 1, "g"], [120205, 1, "h"], [120206, 1, "i"], [120207, 1, "j"], [120208, 1, "k"], [120209, 1, "l"], [120210, 1, "m"], [120211, 1, "n"], [120212, 1, "o"], [120213, 1, "p"], [120214, 1, "q"], [120215, 1, "r"], [120216, 1, "s"], [120217, 1, "t"], [120218, 1, "u"], [120219, 1, "v"], [120220, 1, "w"], [120221, 1, "x"], [120222, 1, "y"], [120223, 1, "z"], [120224, 1, "a"], [120225, 1, "b"], [120226, 1, "c"], [120227, 1, "d"], [120228, 1, "e"], [120229, 1, "f"], [120230, 1, "g"], [120231, 1, "h"], [120232, 1, "i"], [120233, 1, "j"], [120234, 1, "k"], [120235, 1, "l"], [120236, 1, "m"], [120237, 1, "n"], [120238, 1, "o"], [120239, 1, "p"], [120240, 1, "q"], [120241, 1, "r"], [120242, 1, "s"], [120243, 1, "t"], [120244, 1, "u"], [120245, 1, "v"], [120246, 1, "w"], [120247, 1, "x"], [120248, 1, "y"], [120249, 1, "z"], [120250, 1, "a"], [120251, 1, "b"], [120252, 1, "c"], [120253, 1, "d"], [120254, 1, "e"], [120255, 1, "f"], [120256, 1, "g"], [120257, 1, "h"], [120258, 1, "i"], [120259, 1, "j"], [120260, 1, "k"], [120261, 1, "l"], [120262, 1, "m"], [120263, 1, "n"], [120264, 1, "o"], [120265, 1, "p"], [120266, 1, "q"], [120267, 1, "r"], [120268, 1, "s"], [120269, 1, "t"], [120270, 1, "u"], [120271, 1, "v"], [120272, 1, "w"], [120273, 1, "x"], [120274, 1, "y"], [120275, 1, "z"], [120276, 1, "a"], [120277, 1, "b"], [120278, 1, "c"], [120279, 1, "d"], [120280, 1, "e"], [120281, 1, "f"], [120282, 1, "g"], [120283, 1, "h"], [120284, 1, "i"], [120285, 1, "j"], [120286, 1, "k"], [120287, 1, "l"], [120288, 1, "m"], [120289, 1, "n"], [120290, 1, "o"], [120291, 1, "p"], [120292, 1, "q"], [120293, 1, "r"], [120294, 1, "s"], [120295, 1, "t"], [120296, 1, "u"], [120297, 1, "v"], [120298, 1, "w"], [120299, 1, "x"], [120300, 1, "y"], [120301, 1, "z"], [120302, 1, "a"], [120303, 1, "b"], [120304, 1, "c"], [120305, 1, "d"], [120306, 1, "e"], [120307, 1, "f"], [120308, 1, "g"], [120309, 1, "h"], [120310, 1, "i"], [120311, 1, "j"], [120312, 1, "k"], [120313, 1, "l"], [120314, 1, "m"], [120315, 1, "n"], [120316, 1, "o"], [120317, 1, "p"], [120318, 1, "q"], [120319, 1, "r"], [120320, 1, "s"], [120321, 1, "t"], [120322, 1, "u"], [120323, 1, "v"], [120324, 1, "w"], [120325, 1, "x"], [120326, 1, "y"], [120327, 1, "z"], [120328, 1, "a"], [120329, 1, "b"], [120330, 1, "c"], [120331, 1, "d"], [120332, 1, "e"], [120333, 1, "f"], [120334, 1, "g"], [120335, 1, "h"], [120336, 1, "i"], [120337, 1, "j"], [120338, 1, "k"], [120339, 1, "l"], [120340, 1, "m"], [120341, 1, "n"], [120342, 1, "o"], [120343, 1, "p"], [120344, 1, "q"], [120345, 1, "r"], [120346, 1, "s"], [120347, 1, "t"], [120348, 1, "u"], [120349, 1, "v"], [120350, 1, "w"], [120351, 1, "x"], [120352, 1, "y"], [120353, 1, "z"], [120354, 1, "a"], [120355, 1, "b"], [120356, 1, "c"], [120357, 1, "d"], [120358, 1, "e"], [120359, 1, "f"], [120360, 1, "g"], [120361, 1, "h"], [120362, 1, "i"], [120363, 1, "j"], [120364, 1, "k"], [120365, 1, "l"], [120366, 1, "m"], [120367, 1, "n"], [120368, 1, "o"], [120369, 1, "p"], [120370, 1, "q"], [120371, 1, "r"], [120372, 1, "s"], [120373, 1, "t"], [120374, 1, "u"], [120375, 1, "v"], [120376, 1, "w"], [120377, 1, "x"], [120378, 1, "y"], [120379, 1, "z"], [120380, 1, "a"], [120381, 1, "b"], [120382, 1, "c"], [120383, 1, "d"], [120384, 1, "e"], [120385, 1, "f"], [120386, 1, "g"], [120387, 1, "h"], [120388, 1, "i"], [120389, 1, "j"], [120390, 1, "k"], [120391, 1, "l"], [120392, 1, "m"], [120393, 1, "n"], [120394, 1, "o"], [120395, 1, "p"], [120396, 1, "q"], [120397, 1, "r"], [120398, 1, "s"], [120399, 1, "t"], [120400, 1, "u"], [120401, 1, "v"], [120402, 1, "w"], [120403, 1, "x"], [120404, 1, "y"], [120405, 1, "z"], [120406, 1, "a"], [120407, 1, "b"], [120408, 1, "c"], [120409, 1, "d"], [120410, 1, "e"], [120411, 1, "f"], [120412, 1, "g"], [120413, 1, "h"], [120414, 1, "i"], [120415, 1, "j"], [120416, 1, "k"], [120417, 1, "l"], [120418, 1, "m"], [120419, 1, "n"], [120420, 1, "o"], [120421, 1, "p"], [120422, 1, "q"], [120423, 1, "r"], [120424, 1, "s"], [120425, 1, "t"], [120426, 1, "u"], [120427, 1, "v"], [120428, 1, "w"], [120429, 1, "x"], [120430, 1, "y"], [120431, 1, "z"], [120432, 1, "a"], [120433, 1, "b"], [120434, 1, "c"], [120435, 1, "d"], [120436, 1, "e"], [120437, 1, "f"], [120438, 1, "g"], [120439, 1, "h"], [120440, 1, "i"], [120441, 1, "j"], [120442, 1, "k"], [120443, 1, "l"], [120444, 1, "m"], [120445, 1, "n"], [120446, 1, "o"], [120447, 1, "p"], [120448, 1, "q"], [120449, 1, "r"], [120450, 1, "s"], [120451, 1, "t"], [120452, 1, "u"], [120453, 1, "v"], [120454, 1, "w"], [120455, 1, "x"], [120456, 1, "y"], [120457, 1, "z"], [120458, 1, "a"], [120459, 1, "b"], [120460, 1, "c"], [120461, 1, "d"], [120462, 1, "e"], [120463, 1, "f"], [120464, 1, "g"], [120465, 1, "h"], [120466, 1, "i"], [120467, 1, "j"], [120468, 1, "k"], [120469, 1, "l"], [120470, 1, "m"], [120471, 1, "n"], [120472, 1, "o"], [120473, 1, "p"], [120474, 1, "q"], [120475, 1, "r"], [120476, 1, "s"], [120477, 1, "t"], [120478, 1, "u"], [120479, 1, "v"], [120480, 1, "w"], [120481, 1, "x"], [120482, 1, "y"], [120483, 1, "z"], [120484, 1, "\u0131"], [120485, 1, "\u0237"], [[120486, 120487], 3], [120488, 1, "\u03B1"], [120489, 1, "\u03B2"], [120490, 1, "\u03B3"], [120491, 1, "\u03B4"], [120492, 1, "\u03B5"], [120493, 1, "\u03B6"], [120494, 1, "\u03B7"], [120495, 1, "\u03B8"], [120496, 1, "\u03B9"], [120497, 1, "\u03BA"], [120498, 1, "\u03BB"], [120499, 1, "\u03BC"], [120500, 1, "\u03BD"], [120501, 1, "\u03BE"], [120502, 1, "\u03BF"], [120503, 1, "\u03C0"], [120504, 1, "\u03C1"], [120505, 1, "\u03B8"], [120506, 1, "\u03C3"], [120507, 1, "\u03C4"], [120508, 1, "\u03C5"], [120509, 1, "\u03C6"], [120510, 1, "\u03C7"], [120511, 1, "\u03C8"], [120512, 1, "\u03C9"], [120513, 1, "\u2207"], [120514, 1, "\u03B1"], [120515, 1, "\u03B2"], [120516, 1, "\u03B3"], [120517, 1, "\u03B4"], [120518, 1, "\u03B5"], [120519, 1, "\u03B6"], [120520, 1, "\u03B7"], [120521, 1, "\u03B8"], [120522, 1, "\u03B9"], [120523, 1, "\u03BA"], [120524, 1, "\u03BB"], [120525, 1, "\u03BC"], [120526, 1, "\u03BD"], [120527, 1, "\u03BE"], [120528, 1, "\u03BF"], [120529, 1, "\u03C0"], [120530, 1, "\u03C1"], [[120531, 120532], 1, "\u03C3"], [120533, 1, "\u03C4"], [120534, 1, "\u03C5"], [120535, 1, "\u03C6"], [120536, 1, "\u03C7"], [120537, 1, "\u03C8"], [120538, 1, "\u03C9"], [120539, 1, "\u2202"], [120540, 1, "\u03B5"], [120541, 1, "\u03B8"], [120542, 1, "\u03BA"], [120543, 1, "\u03C6"], [120544, 1, "\u03C1"], [120545, 1, "\u03C0"], [120546, 1, "\u03B1"], [120547, 1, "\u03B2"], [120548, 1, "\u03B3"], [120549, 1, "\u03B4"], [120550, 1, "\u03B5"], [120551, 1, "\u03B6"], [120552, 1, "\u03B7"], [120553, 1, "\u03B8"], [120554, 1, "\u03B9"], [120555, 1, "\u03BA"], [120556, 1, "\u03BB"], [120557, 1, "\u03BC"], [120558, 1, "\u03BD"], [120559, 1, "\u03BE"], [120560, 1, "\u03BF"], [120561, 1, "\u03C0"], [120562, 1, "\u03C1"], [120563, 1, "\u03B8"], [120564, 1, "\u03C3"], [120565, 1, "\u03C4"], [120566, 1, "\u03C5"], [120567, 1, "\u03C6"], [120568, 1, "\u03C7"], [120569, 1, "\u03C8"], [120570, 1, "\u03C9"], [120571, 1, "\u2207"], [120572, 1, "\u03B1"], [120573, 1, "\u03B2"], [120574, 1, "\u03B3"], [120575, 1, "\u03B4"], [120576, 1, "\u03B5"], [120577, 1, "\u03B6"], [120578, 1, "\u03B7"], [120579, 1, "\u03B8"], [120580, 1, "\u03B9"], [120581, 1, "\u03BA"], [120582, 1, "\u03BB"], [120583, 1, "\u03BC"], [120584, 1, "\u03BD"], [120585, 1, "\u03BE"], [120586, 1, "\u03BF"], [120587, 1, "\u03C0"], [120588, 1, "\u03C1"], [[120589, 120590], 1, "\u03C3"], [120591, 1, "\u03C4"], [120592, 1, "\u03C5"], [120593, 1, "\u03C6"], [120594, 1, "\u03C7"], [120595, 1, "\u03C8"], [120596, 1, "\u03C9"], [120597, 1, "\u2202"], [120598, 1, "\u03B5"], [120599, 1, "\u03B8"], [120600, 1, "\u03BA"], [120601, 1, "\u03C6"], [120602, 1, "\u03C1"], [120603, 1, "\u03C0"], [120604, 1, "\u03B1"], [120605, 1, "\u03B2"], [120606, 1, "\u03B3"], [120607, 1, "\u03B4"], [120608, 1, "\u03B5"], [120609, 1, "\u03B6"], [120610, 1, "\u03B7"], [120611, 1, "\u03B8"], [120612, 1, "\u03B9"], [120613, 1, "\u03BA"], [120614, 1, "\u03BB"], [120615, 1, "\u03BC"], [120616, 1, "\u03BD"], [120617, 1, "\u03BE"], [120618, 1, "\u03BF"], [120619, 1, "\u03C0"], [120620, 1, "\u03C1"], [120621, 1, "\u03B8"], [120622, 1, "\u03C3"], [120623, 1, "\u03C4"], [120624, 1, "\u03C5"], [120625, 1, "\u03C6"], [120626, 1, "\u03C7"], [120627, 1, "\u03C8"], [120628, 1, "\u03C9"], [120629, 1, "\u2207"], [120630, 1, "\u03B1"], [120631, 1, "\u03B2"], [120632, 1, "\u03B3"], [120633, 1, "\u03B4"], [120634, 1, "\u03B5"], [120635, 1, "\u03B6"], [120636, 1, "\u03B7"], [120637, 1, "\u03B8"], [120638, 1, "\u03B9"], [120639, 1, "\u03BA"], [120640, 1, "\u03BB"], [120641, 1, "\u03BC"], [120642, 1, "\u03BD"], [120643, 1, "\u03BE"], [120644, 1, "\u03BF"], [120645, 1, "\u03C0"], [120646, 1, "\u03C1"], [[120647, 120648], 1, "\u03C3"], [120649, 1, "\u03C4"], [120650, 1, "\u03C5"], [120651, 1, "\u03C6"], [120652, 1, "\u03C7"], [120653, 1, "\u03C8"], [120654, 1, "\u03C9"], [120655, 1, "\u2202"], [120656, 1, "\u03B5"], [120657, 1, "\u03B8"], [120658, 1, "\u03BA"], [120659, 1, "\u03C6"], [120660, 1, "\u03C1"], [120661, 1, "\u03C0"], [120662, 1, "\u03B1"], [120663, 1, "\u03B2"], [120664, 1, "\u03B3"], [120665, 1, "\u03B4"], [120666, 1, "\u03B5"], [120667, 1, "\u03B6"], [120668, 1, "\u03B7"], [120669, 1, "\u03B8"], [120670, 1, "\u03B9"], [120671, 1, "\u03BA"], [120672, 1, "\u03BB"], [120673, 1, "\u03BC"], [120674, 1, "\u03BD"], [120675, 1, "\u03BE"], [120676, 1, "\u03BF"], [120677, 1, "\u03C0"], [120678, 1, "\u03C1"], [120679, 1, "\u03B8"], [120680, 1, "\u03C3"], [120681, 1, "\u03C4"], [120682, 1, "\u03C5"], [120683, 1, "\u03C6"], [120684, 1, "\u03C7"], [120685, 1, "\u03C8"], [120686, 1, "\u03C9"], [120687, 1, "\u2207"], [120688, 1, "\u03B1"], [120689, 1, "\u03B2"], [120690, 1, "\u03B3"], [120691, 1, "\u03B4"], [120692, 1, "\u03B5"], [120693, 1, "\u03B6"], [120694, 1, "\u03B7"], [120695, 1, "\u03B8"], [120696, 1, "\u03B9"], [120697, 1, "\u03BA"], [120698, 1, "\u03BB"], [120699, 1, "\u03BC"], [120700, 1, "\u03BD"], [120701, 1, "\u03BE"], [120702, 1, "\u03BF"], [120703, 1, "\u03C0"], [120704, 1, "\u03C1"], [[120705, 120706], 1, "\u03C3"], [120707, 1, "\u03C4"], [120708, 1, "\u03C5"], [120709, 1, "\u03C6"], [120710, 1, "\u03C7"], [120711, 1, "\u03C8"], [120712, 1, "\u03C9"], [120713, 1, "\u2202"], [120714, 1, "\u03B5"], [120715, 1, "\u03B8"], [120716, 1, "\u03BA"], [120717, 1, "\u03C6"], [120718, 1, "\u03C1"], [120719, 1, "\u03C0"], [120720, 1, "\u03B1"], [120721, 1, "\u03B2"], [120722, 1, "\u03B3"], [120723, 1, "\u03B4"], [120724, 1, "\u03B5"], [120725, 1, "\u03B6"], [120726, 1, "\u03B7"], [120727, 1, "\u03B8"], [120728, 1, "\u03B9"], [120729, 1, "\u03BA"], [120730, 1, "\u03BB"], [120731, 1, "\u03BC"], [120732, 1, "\u03BD"], [120733, 1, "\u03BE"], [120734, 1, "\u03BF"], [120735, 1, "\u03C0"], [120736, 1, "\u03C1"], [120737, 1, "\u03B8"], [120738, 1, "\u03C3"], [120739, 1, "\u03C4"], [120740, 1, "\u03C5"], [120741, 1, "\u03C6"], [120742, 1, "\u03C7"], [120743, 1, "\u03C8"], [120744, 1, "\u03C9"], [120745, 1, "\u2207"], [120746, 1, "\u03B1"], [120747, 1, "\u03B2"], [120748, 1, "\u03B3"], [120749, 1, "\u03B4"], [120750, 1, "\u03B5"], [120751, 1, "\u03B6"], [120752, 1, "\u03B7"], [120753, 1, "\u03B8"], [120754, 1, "\u03B9"], [120755, 1, "\u03BA"], [120756, 1, "\u03BB"], [120757, 1, "\u03BC"], [120758, 1, "\u03BD"], [120759, 1, "\u03BE"], [120760, 1, "\u03BF"], [120761, 1, "\u03C0"], [120762, 1, "\u03C1"], [[120763, 120764], 1, "\u03C3"], [120765, 1, "\u03C4"], [120766, 1, "\u03C5"], [120767, 1, "\u03C6"], [120768, 1, "\u03C7"], [120769, 1, "\u03C8"], [120770, 1, "\u03C9"], [120771, 1, "\u2202"], [120772, 1, "\u03B5"], [120773, 1, "\u03B8"], [120774, 1, "\u03BA"], [120775, 1, "\u03C6"], [120776, 1, "\u03C1"], [120777, 1, "\u03C0"], [[120778, 120779], 1, "\u03DD"], [[120780, 120781], 3], [120782, 1, "0"], [120783, 1, "1"], [120784, 1, "2"], [120785, 1, "3"], [120786, 1, "4"], [120787, 1, "5"], [120788, 1, "6"], [120789, 1, "7"], [120790, 1, "8"], [120791, 1, "9"], [120792, 1, "0"], [120793, 1, "1"], [120794, 1, "2"], [120795, 1, "3"], [120796, 1, "4"], [120797, 1, "5"], [120798, 1, "6"], [120799, 1, "7"], [120800, 1, "8"], [120801, 1, "9"], [120802, 1, "0"], [120803, 1, "1"], [120804, 1, "2"], [120805, 1, "3"], [120806, 1, "4"], [120807, 1, "5"], [120808, 1, "6"], [120809, 1, "7"], [120810, 1, "8"], [120811, 1, "9"], [120812, 1, "0"], [120813, 1, "1"], [120814, 1, "2"], [120815, 1, "3"], [120816, 1, "4"], [120817, 1, "5"], [120818, 1, "6"], [120819, 1, "7"], [120820, 1, "8"], [120821, 1, "9"], [120822, 1, "0"], [120823, 1, "1"], [120824, 1, "2"], [120825, 1, "3"], [120826, 1, "4"], [120827, 1, "5"], [120828, 1, "6"], [120829, 1, "7"], [120830, 1, "8"], [120831, 1, "9"], [[120832, 121343], 2], [[121344, 121398], 2], [[121399, 121402], 2], [[121403, 121452], 2], [[121453, 121460], 2], [121461, 2], [[121462, 121475], 2], [121476, 2], [[121477, 121483], 2], [[121484, 121498], 3], [[121499, 121503], 2], [121504, 3], [[121505, 121519], 2], [[121520, 122623], 3], [[122624, 122654], 2], [[122655, 122879], 3], [[122880, 122886], 2], [122887, 3], [[122888, 122904], 2], [[122905, 122906], 3], [[122907, 122913], 2], [122914, 3], [[122915, 122916], 2], [122917, 3], [[122918, 122922], 2], [[122923, 123135], 3], [[123136, 123180], 2], [[123181, 123183], 3], [[123184, 123197], 2], [[123198, 123199], 3], [[123200, 123209], 2], [[123210, 123213], 3], [123214, 2], [123215, 2], [[123216, 123535], 3], [[123536, 123566], 2], [[123567, 123583], 3], [[123584, 123641], 2], [[123642, 123646], 3], [123647, 2], [[123648, 124895], 3], [[124896, 124902], 2], [124903, 3], [[124904, 124907], 2], [124908, 3], [[124909, 124910], 2], [124911, 3], [[124912, 124926], 2], [124927, 3], [[124928, 125124], 2], [[125125, 125126], 3], [[125127, 125135], 2], [[125136, 125142], 2], [[125143, 125183], 3], [125184, 1, "\u{1E922}"], [125185, 1, "\u{1E923}"], [125186, 1, "\u{1E924}"], [125187, 1, "\u{1E925}"], [125188, 1, "\u{1E926}"], [125189, 1, "\u{1E927}"], [125190, 1, "\u{1E928}"], [125191, 1, "\u{1E929}"], [125192, 1, "\u{1E92A}"], [125193, 1, "\u{1E92B}"], [125194, 1, "\u{1E92C}"], [125195, 1, "\u{1E92D}"], [125196, 1, "\u{1E92E}"], [125197, 1, "\u{1E92F}"], [125198, 1, "\u{1E930}"], [125199, 1, "\u{1E931}"], [125200, 1, "\u{1E932}"], [125201, 1, "\u{1E933}"], [125202, 1, "\u{1E934}"], [125203, 1, "\u{1E935}"], [125204, 1, "\u{1E936}"], [125205, 1, "\u{1E937}"], [125206, 1, "\u{1E938}"], [125207, 1, "\u{1E939}"], [125208, 1, "\u{1E93A}"], [125209, 1, "\u{1E93B}"], [125210, 1, "\u{1E93C}"], [125211, 1, "\u{1E93D}"], [125212, 1, "\u{1E93E}"], [125213, 1, "\u{1E93F}"], [125214, 1, "\u{1E940}"], [125215, 1, "\u{1E941}"], [125216, 1, "\u{1E942}"], [125217, 1, "\u{1E943}"], [[125218, 125258], 2], [125259, 2], [[125260, 125263], 3], [[125264, 125273], 2], [[125274, 125277], 3], [[125278, 125279], 2], [[125280, 126064], 3], [[126065, 126132], 2], [[126133, 126208], 3], [[126209, 126269], 2], [[126270, 126463], 3], [126464, 1, "\u0627"], [126465, 1, "\u0628"], [126466, 1, "\u062C"], [126467, 1, "\u062F"], [126468, 3], [126469, 1, "\u0648"], [126470, 1, "\u0632"], [126471, 1, "\u062D"], [126472, 1, "\u0637"], [126473, 1, "\u064A"], [126474, 1, "\u0643"], [126475, 1, "\u0644"], [126476, 1, "\u0645"], [126477, 1, "\u0646"], [126478, 1, "\u0633"], [126479, 1, "\u0639"], [126480, 1, "\u0641"], [126481, 1, "\u0635"], [126482, 1, "\u0642"], [126483, 1, "\u0631"], [126484, 1, "\u0634"], [126485, 1, "\u062A"], [126486, 1, "\u062B"], [126487, 1, "\u062E"], [126488, 1, "\u0630"], [126489, 1, "\u0636"], [126490, 1, "\u0638"], [126491, 1, "\u063A"], [126492, 1, "\u066E"], [126493, 1, "\u06BA"], [126494, 1, "\u06A1"], [126495, 1, "\u066F"], [126496, 3], [126497, 1, "\u0628"], [126498, 1, "\u062C"], [126499, 3], [126500, 1, "\u0647"], [[126501, 126502], 3], [126503, 1, "\u062D"], [126504, 3], [126505, 1, "\u064A"], [126506, 1, "\u0643"], [126507, 1, "\u0644"], [126508, 1, "\u0645"], [126509, 1, "\u0646"], [126510, 1, "\u0633"], [126511, 1, "\u0639"], [126512, 1, "\u0641"], [126513, 1, "\u0635"], [126514, 1, "\u0642"], [126515, 3], [126516, 1, "\u0634"], [126517, 1, "\u062A"], [126518, 1, "\u062B"], [126519, 1, "\u062E"], [126520, 3], [126521, 1, "\u0636"], [126522, 3], [126523, 1, "\u063A"], [[126524, 126529], 3], [126530, 1, "\u062C"], [[126531, 126534], 3], [126535, 1, "\u062D"], [126536, 3], [126537, 1, "\u064A"], [126538, 3], [126539, 1, "\u0644"], [126540, 3], [126541, 1, "\u0646"], [126542, 1, "\u0633"], [126543, 1, "\u0639"], [126544, 3], [126545, 1, "\u0635"], [126546, 1, "\u0642"], [126547, 3], [126548, 1, "\u0634"], [[126549, 126550], 3], [126551, 1, "\u062E"], [126552, 3], [126553, 1, "\u0636"], [126554, 3], [126555, 1, "\u063A"], [126556, 3], [126557, 1, "\u06BA"], [126558, 3], [126559, 1, "\u066F"], [126560, 3], [126561, 1, "\u0628"], [126562, 1, "\u062C"], [126563, 3], [126564, 1, "\u0647"], [[126565, 126566], 3], [126567, 1, "\u062D"], [126568, 1, "\u0637"], [126569, 1, "\u064A"], [126570, 1, "\u0643"], [126571, 3], [126572, 1, "\u0645"], [126573, 1, "\u0646"], [126574, 1, "\u0633"], [126575, 1, "\u0639"], [126576, 1, "\u0641"], [126577, 1, "\u0635"], [126578, 1, "\u0642"], [126579, 3], [126580, 1, "\u0634"], [126581, 1, "\u062A"], [126582, 1, "\u062B"], [126583, 1, "\u062E"], [126584, 3], [126585, 1, "\u0636"], [126586, 1, "\u0638"], [126587, 1, "\u063A"], [126588, 1, "\u066E"], [126589, 3], [126590, 1, "\u06A1"], [126591, 3], [126592, 1, "\u0627"], [126593, 1, "\u0628"], [126594, 1, "\u062C"], [126595, 1, "\u062F"], [126596, 1, "\u0647"], [126597, 1, "\u0648"], [126598, 1, "\u0632"], [126599, 1, "\u062D"], [126600, 1, "\u0637"], [126601, 1, "\u064A"], [126602, 3], [126603, 1, "\u0644"], [126604, 1, "\u0645"], [126605, 1, "\u0646"], [126606, 1, "\u0633"], [126607, 1, "\u0639"], [126608, 1, "\u0641"], [126609, 1, "\u0635"], [126610, 1, "\u0642"], [126611, 1, "\u0631"], [126612, 1, "\u0634"], [126613, 1, "\u062A"], [126614, 1, "\u062B"], [126615, 1, "\u062E"], [126616, 1, "\u0630"], [126617, 1, "\u0636"], [126618, 1, "\u0638"], [126619, 1, "\u063A"], [[126620, 126624], 3], [126625, 1, "\u0628"], [126626, 1, "\u062C"], [126627, 1, "\u062F"], [126628, 3], [126629, 1, "\u0648"], [126630, 1, "\u0632"], [126631, 1, "\u062D"], [126632, 1, "\u0637"], [126633, 1, "\u064A"], [126634, 3], [126635, 1, "\u0644"], [126636, 1, "\u0645"], [126637, 1, "\u0646"], [126638, 1, "\u0633"], [126639, 1, "\u0639"], [126640, 1, "\u0641"], [126641, 1, "\u0635"], [126642, 1, "\u0642"], [126643, 1, "\u0631"], [126644, 1, "\u0634"], [126645, 1, "\u062A"], [126646, 1, "\u062B"], [126647, 1, "\u062E"], [126648, 1, "\u0630"], [126649, 1, "\u0636"], [126650, 1, "\u0638"], [126651, 1, "\u063A"], [[126652, 126703], 3], [[126704, 126705], 2], [[126706, 126975], 3], [[126976, 127019], 2], [[127020, 127023], 3], [[127024, 127123], 2], [[127124, 127135], 3], [[127136, 127150], 2], [[127151, 127152], 3], [[127153, 127166], 2], [127167, 2], [127168, 3], [[127169, 127183], 2], [127184, 3], [[127185, 127199], 2], [[127200, 127221], 2], [[127222, 127231], 3], [127232, 3], [127233, 5, "0,"], [127234, 5, "1,"], [127235, 5, "2,"], [127236, 5, "3,"], [127237, 5, "4,"], [127238, 5, "5,"], [127239, 5, "6,"], [127240, 5, "7,"], [127241, 5, "8,"], [127242, 5, "9,"], [[127243, 127244], 2], [[127245, 127247], 2], [127248, 5, "(a)"], [127249, 5, "(b)"], [127250, 5, "(c)"], [127251, 5, "(d)"], [127252, 5, "(e)"], [127253, 5, "(f)"], [127254, 5, "(g)"], [127255, 5, "(h)"], [127256, 5, "(i)"], [127257, 5, "(j)"], [127258, 5, "(k)"], [127259, 5, "(l)"], [127260, 5, "(m)"], [127261, 5, "(n)"], [127262, 5, "(o)"], [127263, 5, "(p)"], [127264, 5, "(q)"], [127265, 5, "(r)"], [127266, 5, "(s)"], [127267, 5, "(t)"], [127268, 5, "(u)"], [127269, 5, "(v)"], [127270, 5, "(w)"], [127271, 5, "(x)"], [127272, 5, "(y)"], [127273, 5, "(z)"], [127274, 1, "\u3014s\u3015"], [127275, 1, "c"], [127276, 1, "r"], [127277, 1, "cd"], [127278, 1, "wz"], [127279, 2], [127280, 1, "a"], [127281, 1, "b"], [127282, 1, "c"], [127283, 1, "d"], [127284, 1, "e"], [127285, 1, "f"], [127286, 1, "g"], [127287, 1, "h"], [127288, 1, "i"], [127289, 1, "j"], [127290, 1, "k"], [127291, 1, "l"], [127292, 1, "m"], [127293, 1, "n"], [127294, 1, "o"], [127295, 1, "p"], [127296, 1, "q"], [127297, 1, "r"], [127298, 1, "s"], [127299, 1, "t"], [127300, 1, "u"], [127301, 1, "v"], [127302, 1, "w"], [127303, 1, "x"], [127304, 1, "y"], [127305, 1, "z"], [127306, 1, "hv"], [127307, 1, "mv"], [127308, 1, "sd"], [127309, 1, "ss"], [127310, 1, "ppv"], [127311, 1, "wc"], [[127312, 127318], 2], [127319, 2], [[127320, 127326], 2], [127327, 2], [[127328, 127337], 2], [127338, 1, "mc"], [127339, 1, "md"], [127340, 1, "mr"], [[127341, 127343], 2], [[127344, 127352], 2], [127353, 2], [127354, 2], [[127355, 127356], 2], [[127357, 127358], 2], [127359, 2], [[127360, 127369], 2], [[127370, 127373], 2], [[127374, 127375], 2], [127376, 1, "dj"], [[127377, 127386], 2], [[127387, 127404], 2], [127405, 2], [[127406, 127461], 3], [[127462, 127487], 2], [127488, 1, "\u307B\u304B"], [127489, 1, "\u30B3\u30B3"], [127490, 1, "\u30B5"], [[127491, 127503], 3], [127504, 1, "\u624B"], [127505, 1, "\u5B57"], [127506, 1, "\u53CC"], [127507, 1, "\u30C7"], [127508, 1, "\u4E8C"], [127509, 1, "\u591A"], [127510, 1, "\u89E3"], [127511, 1, "\u5929"], [127512, 1, "\u4EA4"], [127513, 1, "\u6620"], [127514, 1, "\u7121"], [127515, 1, "\u6599"], [127516, 1, "\u524D"], [127517, 1, "\u5F8C"], [127518, 1, "\u518D"], [127519, 1, "\u65B0"], [127520, 1, "\u521D"], [127521, 1, "\u7D42"], [127522, 1, "\u751F"], [127523, 1, "\u8CA9"], [127524, 1, "\u58F0"], [127525, 1, "\u5439"], [127526, 1, "\u6F14"], [127527, 1, "\u6295"], [127528, 1, "\u6355"], [127529, 1, "\u4E00"], [127530, 1, "\u4E09"], [127531, 1, "\u904A"], [127532, 1, "\u5DE6"], [127533, 1, "\u4E2D"], [127534, 1, "\u53F3"], [127535, 1, "\u6307"], [127536, 1, "\u8D70"], [127537, 1, "\u6253"], [127538, 1, "\u7981"], [127539, 1, "\u7A7A"], [127540, 1, "\u5408"], [127541, 1, "\u6E80"], [127542, 1, "\u6709"], [127543, 1, "\u6708"], [127544, 1, "\u7533"], [127545, 1, "\u5272"], [127546, 1, "\u55B6"], [127547, 1, "\u914D"], [[127548, 127551], 3], [127552, 1, "\u3014\u672C\u3015"], [127553, 1, "\u3014\u4E09\u3015"], [127554, 1, "\u3014\u4E8C\u3015"], [127555, 1, "\u3014\u5B89\u3015"], [127556, 1, "\u3014\u70B9\u3015"], [127557, 1, "\u3014\u6253\u3015"], [127558, 1, "\u3014\u76D7\u3015"], [127559, 1, "\u3014\u52DD\u3015"], [127560, 1, "\u3014\u6557\u3015"], [[127561, 127567], 3], [127568, 1, "\u5F97"], [127569, 1, "\u53EF"], [[127570, 127583], 3], [[127584, 127589], 2], [[127590, 127743], 3], [[127744, 127776], 2], [[127777, 127788], 2], [[127789, 127791], 2], [[127792, 127797], 2], [127798, 2], [[127799, 127868], 2], [127869, 2], [[127870, 127871], 2], [[127872, 127891], 2], [[127892, 127903], 2], [[127904, 127940], 2], [127941, 2], [[127942, 127946], 2], [[127947, 127950], 2], [[127951, 127955], 2], [[127956, 127967], 2], [[127968, 127984], 2], [[127985, 127991], 2], [[127992, 127999], 2], [[128e3, 128062], 2], [128063, 2], [128064, 2], [128065, 2], [[128066, 128247], 2], [128248, 2], [[128249, 128252], 2], [[128253, 128254], 2], [128255, 2], [[128256, 128317], 2], [[128318, 128319], 2], [[128320, 128323], 2], [[128324, 128330], 2], [[128331, 128335], 2], [[128336, 128359], 2], [[128360, 128377], 2], [128378, 2], [[128379, 128419], 2], [128420, 2], [[128421, 128506], 2], [[128507, 128511], 2], [128512, 2], [[128513, 128528], 2], [128529, 2], [[128530, 128532], 2], [128533, 2], [128534, 2], [128535, 2], [128536, 2], [128537, 2], [128538, 2], [128539, 2], [[128540, 128542], 2], [128543, 2], [[128544, 128549], 2], [[128550, 128551], 2], [[128552, 128555], 2], [128556, 2], [128557, 2], [[128558, 128559], 2], [[128560, 128563], 2], [128564, 2], [[128565, 128576], 2], [[128577, 128578], 2], [[128579, 128580], 2], [[128581, 128591], 2], [[128592, 128639], 2], [[128640, 128709], 2], [[128710, 128719], 2], [128720, 2], [[128721, 128722], 2], [[128723, 128724], 2], [128725, 2], [[128726, 128727], 2], [[128728, 128732], 3], [[128733, 128735], 2], [[128736, 128748], 2], [[128749, 128751], 3], [[128752, 128755], 2], [[128756, 128758], 2], [[128759, 128760], 2], [128761, 2], [128762, 2], [[128763, 128764], 2], [[128765, 128767], 3], [[128768, 128883], 2], [[128884, 128895], 3], [[128896, 128980], 2], [[128981, 128984], 2], [[128985, 128991], 3], [[128992, 129003], 2], [[129004, 129007], 3], [129008, 2], [[129009, 129023], 3], [[129024, 129035], 2], [[129036, 129039], 3], [[129040, 129095], 2], [[129096, 129103], 3], [[129104, 129113], 2], [[129114, 129119], 3], [[129120, 129159], 2], [[129160, 129167], 3], [[129168, 129197], 2], [[129198, 129199], 3], [[129200, 129201], 2], [[129202, 129279], 3], [[129280, 129291], 2], [129292, 2], [[129293, 129295], 2], [[129296, 129304], 2], [[129305, 129310], 2], [129311, 2], [[129312, 129319], 2], [[129320, 129327], 2], [129328, 2], [[129329, 129330], 2], [[129331, 129342], 2], [129343, 2], [[129344, 129355], 2], [129356, 2], [[129357, 129359], 2], [[129360, 129374], 2], [[129375, 129387], 2], [[129388, 129392], 2], [129393, 2], [129394, 2], [[129395, 129398], 2], [[129399, 129400], 2], [129401, 2], [129402, 2], [129403, 2], [[129404, 129407], 2], [[129408, 129412], 2], [[129413, 129425], 2], [[129426, 129431], 2], [[129432, 129442], 2], [[129443, 129444], 2], [[129445, 129450], 2], [[129451, 129453], 2], [[129454, 129455], 2], [[129456, 129465], 2], [[129466, 129471], 2], [129472, 2], [[129473, 129474], 2], [[129475, 129482], 2], [129483, 2], [129484, 2], [[129485, 129487], 2], [[129488, 129510], 2], [[129511, 129535], 2], [[129536, 129619], 2], [[129620, 129631], 3], [[129632, 129645], 2], [[129646, 129647], 3], [[129648, 129651], 2], [129652, 2], [[129653, 129655], 3], [[129656, 129658], 2], [[129659, 129660], 2], [[129661, 129663], 3], [[129664, 129666], 2], [[129667, 129670], 2], [[129671, 129679], 3], [[129680, 129685], 2], [[129686, 129704], 2], [[129705, 129708], 2], [[129709, 129711], 3], [[129712, 129718], 2], [[129719, 129722], 2], [[129723, 129727], 3], [[129728, 129730], 2], [[129731, 129733], 2], [[129734, 129743], 3], [[129744, 129750], 2], [[129751, 129753], 2], [[129754, 129759], 3], [[129760, 129767], 2], [[129768, 129775], 3], [[129776, 129782], 2], [[129783, 129791], 3], [[129792, 129938], 2], [129939, 3], [[129940, 129994], 2], [[129995, 130031], 3], [130032, 1, "0"], [130033, 1, "1"], [130034, 1, "2"], [130035, 1, "3"], [130036, 1, "4"], [130037, 1, "5"], [130038, 1, "6"], [130039, 1, "7"], [130040, 1, "8"], [130041, 1, "9"], [[130042, 131069], 3], [[131070, 131071], 3], [[131072, 173782], 2], [[173783, 173789], 2], [[173790, 173791], 2], [[173792, 173823], 3], [[173824, 177972], 2], [[177973, 177976], 2], [[177977, 177983], 3], [[177984, 178205], 2], [[178206, 178207], 3], [[178208, 183969], 2], [[183970, 183983], 3], [[183984, 191456], 2], [[191457, 194559], 3], [194560, 1, "\u4E3D"], [194561, 1, "\u4E38"], [194562, 1, "\u4E41"], [194563, 1, "\u{20122}"], [194564, 1, "\u4F60"], [194565, 1, "\u4FAE"], [194566, 1, "\u4FBB"], [194567, 1, "\u5002"], [194568, 1, "\u507A"], [194569, 1, "\u5099"], [194570, 1, "\u50E7"], [194571, 1, "\u50CF"], [194572, 1, "\u349E"], [194573, 1, "\u{2063A}"], [194574, 1, "\u514D"], [194575, 1, "\u5154"], [194576, 1, "\u5164"], [194577, 1, "\u5177"], [194578, 1, "\u{2051C}"], [194579, 1, "\u34B9"], [194580, 1, "\u5167"], [194581, 1, "\u518D"], [194582, 1, "\u{2054B}"], [194583, 1, "\u5197"], [194584, 1, "\u51A4"], [194585, 1, "\u4ECC"], [194586, 1, "\u51AC"], [194587, 1, "\u51B5"], [194588, 1, "\u{291DF}"], [194589, 1, "\u51F5"], [194590, 1, "\u5203"], [194591, 1, "\u34DF"], [194592, 1, "\u523B"], [194593, 1, "\u5246"], [194594, 1, "\u5272"], [194595, 1, "\u5277"], [194596, 1, "\u3515"], [194597, 1, "\u52C7"], [194598, 1, "\u52C9"], [194599, 1, "\u52E4"], [194600, 1, "\u52FA"], [194601, 1, "\u5305"], [194602, 1, "\u5306"], [194603, 1, "\u5317"], [194604, 1, "\u5349"], [194605, 1, "\u5351"], [194606, 1, "\u535A"], [194607, 1, "\u5373"], [194608, 1, "\u537D"], [[194609, 194611], 1, "\u537F"], [194612, 1, "\u{20A2C}"], [194613, 1, "\u7070"], [194614, 1, "\u53CA"], [194615, 1, "\u53DF"], [194616, 1, "\u{20B63}"], [194617, 1, "\u53EB"], [194618, 1, "\u53F1"], [194619, 1, "\u5406"], [194620, 1, "\u549E"], [194621, 1, "\u5438"], [194622, 1, "\u5448"], [194623, 1, "\u5468"], [194624, 1, "\u54A2"], [194625, 1, "\u54F6"], [194626, 1, "\u5510"], [194627, 1, "\u5553"], [194628, 1, "\u5563"], [[194629, 194630], 1, "\u5584"], [194631, 1, "\u5599"], [194632, 1, "\u55AB"], [194633, 1, "\u55B3"], [194634, 1, "\u55C2"], [194635, 1, "\u5716"], [194636, 1, "\u5606"], [194637, 1, "\u5717"], [194638, 1, "\u5651"], [194639, 1, "\u5674"], [194640, 1, "\u5207"], [194641, 1, "\u58EE"], [194642, 1, "\u57CE"], [194643, 1, "\u57F4"], [194644, 1, "\u580D"], [194645, 1, "\u578B"], [194646, 1, "\u5832"], [194647, 1, "\u5831"], [194648, 1, "\u58AC"], [194649, 1, "\u{214E4}"], [194650, 1, "\u58F2"], [194651, 1, "\u58F7"], [194652, 1, "\u5906"], [194653, 1, "\u591A"], [194654, 1, "\u5922"], [194655, 1, "\u5962"], [194656, 1, "\u{216A8}"], [194657, 1, "\u{216EA}"], [194658, 1, "\u59EC"], [194659, 1, "\u5A1B"], [194660, 1, "\u5A27"], [194661, 1, "\u59D8"], [194662, 1, "\u5A66"], [194663, 1, "\u36EE"], [194664, 3], [194665, 1, "\u5B08"], [[194666, 194667], 1, "\u5B3E"], [194668, 1, "\u{219C8}"], [194669, 1, "\u5BC3"], [194670, 1, "\u5BD8"], [194671, 1, "\u5BE7"], [194672, 1, "\u5BF3"], [194673, 1, "\u{21B18}"], [194674, 1, "\u5BFF"], [194675, 1, "\u5C06"], [194676, 3], [194677, 1, "\u5C22"], [194678, 1, "\u3781"], [194679, 1, "\u5C60"], [194680, 1, "\u5C6E"], [194681, 1, "\u5CC0"], [194682, 1, "\u5C8D"], [194683, 1, "\u{21DE4}"], [194684, 1, "\u5D43"], [194685, 1, "\u{21DE6}"], [194686, 1, "\u5D6E"], [194687, 1, "\u5D6B"], [194688, 1, "\u5D7C"], [194689, 1, "\u5DE1"], [194690, 1, "\u5DE2"], [194691, 1, "\u382F"], [194692, 1, "\u5DFD"], [194693, 1, "\u5E28"], [194694, 1, "\u5E3D"], [194695, 1, "\u5E69"], [194696, 1, "\u3862"], [194697, 1, "\u{22183}"], [194698, 1, "\u387C"], [194699, 1, "\u5EB0"], [194700, 1, "\u5EB3"], [194701, 1, "\u5EB6"], [194702, 1, "\u5ECA"], [194703, 1, "\u{2A392}"], [194704, 1, "\u5EFE"], [[194705, 194706], 1, "\u{22331}"], [194707, 1, "\u8201"], [[194708, 194709], 1, "\u5F22"], [194710, 1, "\u38C7"], [194711, 1, "\u{232B8}"], [194712, 1, "\u{261DA}"], [194713, 1, "\u5F62"], [194714, 1, "\u5F6B"], [194715, 1, "\u38E3"], [194716, 1, "\u5F9A"], [194717, 1, "\u5FCD"], [194718, 1, "\u5FD7"], [194719, 1, "\u5FF9"], [194720, 1, "\u6081"], [194721, 1, "\u393A"], [194722, 1, "\u391C"], [194723, 1, "\u6094"], [194724, 1, "\u{226D4}"], [194725, 1, "\u60C7"], [194726, 1, "\u6148"], [194727, 1, "\u614C"], [194728, 1, "\u614E"], [194729, 1, "\u614C"], [194730, 1, "\u617A"], [194731, 1, "\u618E"], [194732, 1, "\u61B2"], [194733, 1, "\u61A4"], [194734, 1, "\u61AF"], [194735, 1, "\u61DE"], [194736, 1, "\u61F2"], [194737, 1, "\u61F6"], [194738, 1, "\u6210"], [194739, 1, "\u621B"], [194740, 1, "\u625D"], [194741, 1, "\u62B1"], [194742, 1, "\u62D4"], [194743, 1, "\u6350"], [194744, 1, "\u{22B0C}"], [194745, 1, "\u633D"], [194746, 1, "\u62FC"], [194747, 1, "\u6368"], [194748, 1, "\u6383"], [194749, 1, "\u63E4"], [194750, 1, "\u{22BF1}"], [194751, 1, "\u6422"], [194752, 1, "\u63C5"], [194753, 1, "\u63A9"], [194754, 1, "\u3A2E"], [194755, 1, "\u6469"], [194756, 1, "\u647E"], [194757, 1, "\u649D"], [194758, 1, "\u6477"], [194759, 1, "\u3A6C"], [194760, 1, "\u654F"], [194761, 1, "\u656C"], [194762, 1, "\u{2300A}"], [194763, 1, "\u65E3"], [194764, 1, "\u66F8"], [194765, 1, "\u6649"], [194766, 1, "\u3B19"], [194767, 1, "\u6691"], [194768, 1, "\u3B08"], [194769, 1, "\u3AE4"], [194770, 1, "\u5192"], [194771, 1, "\u5195"], [194772, 1, "\u6700"], [194773, 1, "\u669C"], [194774, 1, "\u80AD"], [194775, 1, "\u43D9"], [194776, 1, "\u6717"], [194777, 1, "\u671B"], [194778, 1, "\u6721"], [194779, 1, "\u675E"], [194780, 1, "\u6753"], [194781, 1, "\u{233C3}"], [194782, 1, "\u3B49"], [194783, 1, "\u67FA"], [194784, 1, "\u6785"], [194785, 1, "\u6852"], [194786, 1, "\u6885"], [194787, 1, "\u{2346D}"], [194788, 1, "\u688E"], [194789, 1, "\u681F"], [194790, 1, "\u6914"], [194791, 1, "\u3B9D"], [194792, 1, "\u6942"], [194793, 1, "\u69A3"], [194794, 1, "\u69EA"], [194795, 1, "\u6AA8"], [194796, 1, "\u{236A3}"], [194797, 1, "\u6ADB"], [194798, 1, "\u3C18"], [194799, 1, "\u6B21"], [194800, 1, "\u{238A7}"], [194801, 1, "\u6B54"], [194802, 1, "\u3C4E"], [194803, 1, "\u6B72"], [194804, 1, "\u6B9F"], [194805, 1, "\u6BBA"], [194806, 1, "\u6BBB"], [194807, 1, "\u{23A8D}"], [194808, 1, "\u{21D0B}"], [194809, 1, "\u{23AFA}"], [194810, 1, "\u6C4E"], [194811, 1, "\u{23CBC}"], [194812, 1, "\u6CBF"], [194813, 1, "\u6CCD"], [194814, 1, "\u6C67"], [194815, 1, "\u6D16"], [194816, 1, "\u6D3E"], [194817, 1, "\u6D77"], [194818, 1, "\u6D41"], [194819, 1, "\u6D69"], [194820, 1, "\u6D78"], [194821, 1, "\u6D85"], [194822, 1, "\u{23D1E}"], [194823, 1, "\u6D34"], [194824, 1, "\u6E2F"], [194825, 1, "\u6E6E"], [194826, 1, "\u3D33"], [194827, 1, "\u6ECB"], [194828, 1, "\u6EC7"], [194829, 1, "\u{23ED1}"], [194830, 1, "\u6DF9"], [194831, 1, "\u6F6E"], [194832, 1, "\u{23F5E}"], [194833, 1, "\u{23F8E}"], [194834, 1, "\u6FC6"], [194835, 1, "\u7039"], [194836, 1, "\u701E"], [194837, 1, "\u701B"], [194838, 1, "\u3D96"], [194839, 1, "\u704A"], [194840, 1, "\u707D"], [194841, 1, "\u7077"], [194842, 1, "\u70AD"], [194843, 1, "\u{20525}"], [194844, 1, "\u7145"], [194845, 1, "\u{24263}"], [194846, 1, "\u719C"], [194847, 3], [194848, 1, "\u7228"], [194849, 1, "\u7235"], [194850, 1, "\u7250"], [194851, 1, "\u{24608}"], [194852, 1, "\u7280"], [194853, 1, "\u7295"], [194854, 1, "\u{24735}"], [194855, 1, "\u{24814}"], [194856, 1, "\u737A"], [194857, 1, "\u738B"], [194858, 1, "\u3EAC"], [194859, 1, "\u73A5"], [[194860, 194861], 1, "\u3EB8"], [194862, 1, "\u7447"], [194863, 1, "\u745C"], [194864, 1, "\u7471"], [194865, 1, "\u7485"], [194866, 1, "\u74CA"], [194867, 1, "\u3F1B"], [194868, 1, "\u7524"], [194869, 1, "\u{24C36}"], [194870, 1, "\u753E"], [194871, 1, "\u{24C92}"], [194872, 1, "\u7570"], [194873, 1, "\u{2219F}"], [194874, 1, "\u7610"], [194875, 1, "\u{24FA1}"], [194876, 1, "\u{24FB8}"], [194877, 1, "\u{25044}"], [194878, 1, "\u3FFC"], [194879, 1, "\u4008"], [194880, 1, "\u76F4"], [194881, 1, "\u{250F3}"], [194882, 1, "\u{250F2}"], [194883, 1, "\u{25119}"], [194884, 1, "\u{25133}"], [194885, 1, "\u771E"], [[194886, 194887], 1, "\u771F"], [194888, 1, "\u774A"], [194889, 1, "\u4039"], [194890, 1, "\u778B"], [194891, 1, "\u4046"], [194892, 1, "\u4096"], [194893, 1, "\u{2541D}"], [194894, 1, "\u784E"], [194895, 1, "\u788C"], [194896, 1, "\u78CC"], [194897, 1, "\u40E3"], [194898, 1, "\u{25626}"], [194899, 1, "\u7956"], [194900, 1, "\u{2569A}"], [194901, 1, "\u{256C5}"], [194902, 1, "\u798F"], [194903, 1, "\u79EB"], [194904, 1, "\u412F"], [194905, 1, "\u7A40"], [194906, 1, "\u7A4A"], [194907, 1, "\u7A4F"], [194908, 1, "\u{2597C}"], [[194909, 194910], 1, "\u{25AA7}"], [194911, 3], [194912, 1, "\u4202"], [194913, 1, "\u{25BAB}"], [194914, 1, "\u7BC6"], [194915, 1, "\u7BC9"], [194916, 1, "\u4227"], [194917, 1, "\u{25C80}"], [194918, 1, "\u7CD2"], [194919, 1, "\u42A0"], [194920, 1, "\u7CE8"], [194921, 1, "\u7CE3"], [194922, 1, "\u7D00"], [194923, 1, "\u{25F86}"], [194924, 1, "\u7D63"], [194925, 1, "\u4301"], [194926, 1, "\u7DC7"], [194927, 1, "\u7E02"], [194928, 1, "\u7E45"], [194929, 1, "\u4334"], [194930, 1, "\u{26228}"], [194931, 1, "\u{26247}"], [194932, 1, "\u4359"], [194933, 1, "\u{262D9}"], [194934, 1, "\u7F7A"], [194935, 1, "\u{2633E}"], [194936, 1, "\u7F95"], [194937, 1, "\u7FFA"], [194938, 1, "\u8005"], [194939, 1, "\u{264DA}"], [194940, 1, "\u{26523}"], [194941, 1, "\u8060"], [194942, 1, "\u{265A8}"], [194943, 1, "\u8070"], [194944, 1, "\u{2335F}"], [194945, 1, "\u43D5"], [194946, 1, "\u80B2"], [194947, 1, "\u8103"], [194948, 1, "\u440B"], [194949, 1, "\u813E"], [194950, 1, "\u5AB5"], [194951, 1, "\u{267A7}"], [194952, 1, "\u{267B5}"], [194953, 1, "\u{23393}"], [194954, 1, "\u{2339C}"], [194955, 1, "\u8201"], [194956, 1, "\u8204"], [194957, 1, "\u8F9E"], [194958, 1, "\u446B"], [194959, 1, "\u8291"], [194960, 1, "\u828B"], [194961, 1, "\u829D"], [194962, 1, "\u52B3"], [194963, 1, "\u82B1"], [194964, 1, "\u82B3"], [194965, 1, "\u82BD"], [194966, 1, "\u82E6"], [194967, 1, "\u{26B3C}"], [194968, 1, "\u82E5"], [194969, 1, "\u831D"], [194970, 1, "\u8363"], [194971, 1, "\u83AD"], [194972, 1, "\u8323"], [194973, 1, "\u83BD"], [194974, 1, "\u83E7"], [194975, 1, "\u8457"], [194976, 1, "\u8353"], [194977, 1, "\u83CA"], [194978, 1, "\u83CC"], [194979, 1, "\u83DC"], [194980, 1, "\u{26C36}"], [194981, 1, "\u{26D6B}"], [194982, 1, "\u{26CD5}"], [194983, 1, "\u452B"], [194984, 1, "\u84F1"], [194985, 1, "\u84F3"], [194986, 1, "\u8516"], [194987, 1, "\u{273CA}"], [194988, 1, "\u8564"], [194989, 1, "\u{26F2C}"], [194990, 1, "\u455D"], [194991, 1, "\u4561"], [194992, 1, "\u{26FB1}"], [194993, 1, "\u{270D2}"], [194994, 1, "\u456B"], [194995, 1, "\u8650"], [194996, 1, "\u865C"], [194997, 1, "\u8667"], [194998, 1, "\u8669"], [194999, 1, "\u86A9"], [195e3, 1, "\u8688"], [195001, 1, "\u870E"], [195002, 1, "\u86E2"], [195003, 1, "\u8779"], [195004, 1, "\u8728"], [195005, 1, "\u876B"], [195006, 1, "\u8786"], [195007, 3], [195008, 1, "\u87E1"], [195009, 1, "\u8801"], [195010, 1, "\u45F9"], [195011, 1, "\u8860"], [195012, 1, "\u8863"], [195013, 1, "\u{27667}"], [195014, 1, "\u88D7"], [195015, 1, "\u88DE"], [195016, 1, "\u4635"], [195017, 1, "\u88FA"], [195018, 1, "\u34BB"], [195019, 1, "\u{278AE}"], [195020, 1, "\u{27966}"], [195021, 1, "\u46BE"], [195022, 1, "\u46C7"], [195023, 1, "\u8AA0"], [195024, 1, "\u8AED"], [195025, 1, "\u8B8A"], [195026, 1, "\u8C55"], [195027, 1, "\u{27CA8}"], [195028, 1, "\u8CAB"], [195029, 1, "\u8CC1"], [195030, 1, "\u8D1B"], [195031, 1, "\u8D77"], [195032, 1, "\u{27F2F}"], [195033, 1, "\u{20804}"], [195034, 1, "\u8DCB"], [195035, 1, "\u8DBC"], [195036, 1, "\u8DF0"], [195037, 1, "\u{208DE}"], [195038, 1, "\u8ED4"], [195039, 1, "\u8F38"], [195040, 1, "\u{285D2}"], [195041, 1, "\u{285ED}"], [195042, 1, "\u9094"], [195043, 1, "\u90F1"], [195044, 1, "\u9111"], [195045, 1, "\u{2872E}"], [195046, 1, "\u911B"], [195047, 1, "\u9238"], [195048, 1, "\u92D7"], [195049, 1, "\u92D8"], [195050, 1, "\u927C"], [195051, 1, "\u93F9"], [195052, 1, "\u9415"], [195053, 1, "\u{28BFA}"], [195054, 1, "\u958B"], [195055, 1, "\u4995"], [195056, 1, "\u95B7"], [195057, 1, "\u{28D77}"], [195058, 1, "\u49E6"], [195059, 1, "\u96C3"], [195060, 1, "\u5DB2"], [195061, 1, "\u9723"], [195062, 1, "\u{29145}"], [195063, 1, "\u{2921A}"], [195064, 1, "\u4A6E"], [195065, 1, "\u4A76"], [195066, 1, "\u97E0"], [195067, 1, "\u{2940A}"], [195068, 1, "\u4AB2"], [195069, 1, "\u{29496}"], [[195070, 195071], 1, "\u980B"], [195072, 1, "\u9829"], [195073, 1, "\u{295B6}"], [195074, 1, "\u98E2"], [195075, 1, "\u4B33"], [195076, 1, "\u9929"], [195077, 1, "\u99A7"], [195078, 1, "\u99C2"], [195079, 1, "\u99FE"], [195080, 1, "\u4BCE"], [195081, 1, "\u{29B30}"], [195082, 1, "\u9B12"], [195083, 1, "\u9C40"], [195084, 1, "\u9CFD"], [195085, 1, "\u4CCE"], [195086, 1, "\u4CED"], [195087, 1, "\u9D67"], [195088, 1, "\u{2A0CE}"], [195089, 1, "\u4CF8"], [195090, 1, "\u{2A105}"], [195091, 1, "\u{2A20E}"], [195092, 1, "\u{2A291}"], [195093, 1, "\u9EBB"], [195094, 1, "\u4D56"], [195095, 1, "\u9EF9"], [195096, 1, "\u9EFE"], [195097, 1, "\u9F05"], [195098, 1, "\u9F0F"], [195099, 1, "\u9F16"], [195100, 1, "\u9F3B"], [195101, 1, "\u{2A600}"], [[195102, 196605], 3], [[196606, 196607], 3], [[196608, 201546], 2], [[201547, 262141], 3], [[262142, 262143], 3], [[262144, 327677], 3], [[327678, 327679], 3], [[327680, 393213], 3], [[393214, 393215], 3], [[393216, 458749], 3], [[458750, 458751], 3], [[458752, 524285], 3], [[524286, 524287], 3], [[524288, 589821], 3], [[589822, 589823], 3], [[589824, 655357], 3], [[655358, 655359], 3], [[655360, 720893], 3], [[720894, 720895], 3], [[720896, 786429], 3], [[786430, 786431], 3], [[786432, 851965], 3], [[851966, 851967], 3], [[851968, 917501], 3], [[917502, 917503], 3], [917504, 3], [917505, 3], [[917506, 917535], 3], [[917536, 917631], 3], [[917632, 917759], 3], [[917760, 917999], 7], [[918e3, 983037], 3], [[983038, 983039], 3], [[983040, 1048573], 3], [[1048574, 1048575], 3], [[1048576, 1114109], 3], [[1114110, 1114111], 3]];
  }
});

// ../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/lib/statusMapping.js
var require_statusMapping = __commonJS({
  "../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/lib/statusMapping.js"(exports, module2) {
    "use strict";
    init_define_process();
    module2.exports.STATUS_MAPPING = {
      mapped: 1,
      valid: 2,
      disallowed: 3,
      disallowed_STD3_valid: 4,
      disallowed_STD3_mapped: 5,
      deviation: 6,
      ignored: 7
    };
  }
});

// ../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/index.js
var require_tr46 = __commonJS({
  "../../node_modules/.pnpm/tr46@3.0.0/node_modules/tr46/index.js"(exports, module2) {
    "use strict";
    init_define_process();
    var punycode = require("punycode");
    var regexes = require_regexes();
    var mappingTable = require_mappingTable();
    var { STATUS_MAPPING } = require_statusMapping();
    function containsNonASCII(str) {
      return /[^\x00-\x7F]/u.test(str);
    }
    __name(containsNonASCII, "containsNonASCII");
    function findStatus(val, { useSTD3ASCIIRules }) {
      let start = 0;
      let end = mappingTable.length - 1;
      while (start <= end) {
        const mid = Math.floor((start + end) / 2);
        const target = mappingTable[mid];
        const min = Array.isArray(target[0]) ? target[0][0] : target[0];
        const max = Array.isArray(target[0]) ? target[0][1] : target[0];
        if (min <= val && max >= val) {
          if (useSTD3ASCIIRules && (target[1] === STATUS_MAPPING.disallowed_STD3_valid || target[1] === STATUS_MAPPING.disallowed_STD3_mapped)) {
            return [STATUS_MAPPING.disallowed, ...target.slice(2)];
          } else if (target[1] === STATUS_MAPPING.disallowed_STD3_valid) {
            return [STATUS_MAPPING.valid, ...target.slice(2)];
          } else if (target[1] === STATUS_MAPPING.disallowed_STD3_mapped) {
            return [STATUS_MAPPING.mapped, ...target.slice(2)];
          }
          return target.slice(1);
        } else if (min > val) {
          end = mid - 1;
        } else {
          start = mid + 1;
        }
      }
      return null;
    }
    __name(findStatus, "findStatus");
    function mapChars(domainName, { useSTD3ASCIIRules, processingOption }) {
      let hasError = false;
      let processed = "";
      for (const ch of domainName) {
        const [status, mapping] = findStatus(ch.codePointAt(0), { useSTD3ASCIIRules });
        switch (status) {
          case STATUS_MAPPING.disallowed:
            hasError = true;
            processed += ch;
            break;
          case STATUS_MAPPING.ignored:
            break;
          case STATUS_MAPPING.mapped:
            processed += mapping;
            break;
          case STATUS_MAPPING.deviation:
            if (processingOption === "transitional") {
              processed += mapping;
            } else {
              processed += ch;
            }
            break;
          case STATUS_MAPPING.valid:
            processed += ch;
            break;
        }
      }
      return {
        string: processed,
        error: hasError
      };
    }
    __name(mapChars, "mapChars");
    function validateLabel(label, { checkHyphens, checkBidi, checkJoiners, processingOption, useSTD3ASCIIRules }) {
      if (label.normalize("NFC") !== label) {
        return false;
      }
      const codePoints = Array.from(label);
      if (checkHyphens) {
        if (codePoints[2] === "-" && codePoints[3] === "-" || (label.startsWith("-") || label.endsWith("-"))) {
          return false;
        }
      }
      if (label.includes(".") || codePoints.length > 0 && regexes.combiningMarks.test(codePoints[0])) {
        return false;
      }
      for (const ch of codePoints) {
        const [status] = findStatus(ch.codePointAt(0), { useSTD3ASCIIRules });
        if (processingOption === "transitional" && status !== STATUS_MAPPING.valid || processingOption === "nontransitional" && status !== STATUS_MAPPING.valid && status !== STATUS_MAPPING.deviation) {
          return false;
        }
      }
      if (checkJoiners) {
        let last = 0;
        for (const [i, ch] of codePoints.entries()) {
          if (ch === "\u200C" || ch === "\u200D") {
            if (i > 0) {
              if (regexes.combiningClassVirama.test(codePoints[i - 1])) {
                continue;
              }
              if (ch === "\u200C") {
                const next = codePoints.indexOf("\u200C", i + 1);
                const test = next < 0 ? codePoints.slice(last) : codePoints.slice(last, next);
                if (regexes.validZWNJ.test(test.join(""))) {
                  last = i + 1;
                  continue;
                }
              }
            }
            return false;
          }
        }
      }
      if (checkBidi) {
        let rtl;
        if (regexes.bidiS1LTR.test(codePoints[0])) {
          rtl = false;
        } else if (regexes.bidiS1RTL.test(codePoints[0])) {
          rtl = true;
        } else {
          return false;
        }
        if (rtl) {
          if (!regexes.bidiS2.test(label) || !regexes.bidiS3.test(label) || regexes.bidiS4EN.test(label) && regexes.bidiS4AN.test(label)) {
            return false;
          }
        } else if (!regexes.bidiS5.test(label) || !regexes.bidiS6.test(label)) {
          return false;
        }
      }
      return true;
    }
    __name(validateLabel, "validateLabel");
    function isBidiDomain(labels) {
      const domain = labels.map((label) => {
        if (label.startsWith("xn--")) {
          try {
            return punycode.decode(label.substring(4));
          } catch (err) {
            return "";
          }
        }
        return label;
      }).join(".");
      return regexes.bidiDomain.test(domain);
    }
    __name(isBidiDomain, "isBidiDomain");
    function processing(domainName, options) {
      const { processingOption } = options;
      let { string, error } = mapChars(domainName, options);
      string = string.normalize("NFC");
      const labels = string.split(".");
      const isBidi = isBidiDomain(labels);
      for (const [i, origLabel] of labels.entries()) {
        let label = origLabel;
        let curProcessing = processingOption;
        if (label.startsWith("xn--")) {
          try {
            label = punycode.decode(label.substring(4));
            labels[i] = label;
          } catch (err) {
            error = true;
            continue;
          }
          curProcessing = "nontransitional";
        }
        if (error) {
          continue;
        }
        const validation = validateLabel(label, __spreadProps(__spreadValues({}, options), {
          processingOption: curProcessing,
          checkBidi: options.checkBidi && isBidi
        }));
        if (!validation) {
          error = true;
        }
      }
      return {
        string: labels.join("."),
        error
      };
    }
    __name(processing, "processing");
    function toASCII(domainName, {
      checkHyphens = false,
      checkBidi = false,
      checkJoiners = false,
      useSTD3ASCIIRules = false,
      processingOption = "nontransitional",
      verifyDNSLength = false
    } = {}) {
      if (processingOption !== "transitional" && processingOption !== "nontransitional") {
        throw new RangeError("processingOption must be either transitional or nontransitional");
      }
      const result = processing(domainName, {
        processingOption,
        checkHyphens,
        checkBidi,
        checkJoiners,
        useSTD3ASCIIRules
      });
      let labels = result.string.split(".");
      labels = labels.map((l) => {
        if (containsNonASCII(l)) {
          try {
            return `xn--${punycode.encode(l)}`;
          } catch (e) {
            result.error = true;
          }
        }
        return l;
      });
      if (verifyDNSLength) {
        const total = labels.join(".").length;
        if (total > 253 || total === 0) {
          result.error = true;
        }
        for (let i = 0; i < labels.length; ++i) {
          if (labels[i].length > 63 || labels[i].length === 0) {
            result.error = true;
            break;
          }
        }
      }
      if (result.error) {
        return null;
      }
      return labels.join(".");
    }
    __name(toASCII, "toASCII");
    function toUnicode(domainName, {
      checkHyphens = false,
      checkBidi = false,
      checkJoiners = false,
      useSTD3ASCIIRules = false,
      processingOption = "nontransitional"
    } = {}) {
      const result = processing(domainName, {
        processingOption,
        checkHyphens,
        checkBidi,
        checkJoiners,
        useSTD3ASCIIRules
      });
      return {
        domain: result.string,
        error: result.error
      };
    }
    __name(toUnicode, "toUnicode");
    module2.exports = {
      toASCII,
      toUnicode
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/infra.js
var require_infra = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/infra.js"(exports, module2) {
    "use strict";
    init_define_process();
    function isASCIIDigit(c) {
      return c >= 48 && c <= 57;
    }
    __name(isASCIIDigit, "isASCIIDigit");
    function isASCIIAlpha(c) {
      return c >= 65 && c <= 90 || c >= 97 && c <= 122;
    }
    __name(isASCIIAlpha, "isASCIIAlpha");
    function isASCIIAlphanumeric(c) {
      return isASCIIAlpha(c) || isASCIIDigit(c);
    }
    __name(isASCIIAlphanumeric, "isASCIIAlphanumeric");
    function isASCIIHex(c) {
      return isASCIIDigit(c) || c >= 65 && c <= 70 || c >= 97 && c <= 102;
    }
    __name(isASCIIHex, "isASCIIHex");
    module2.exports = {
      isASCIIDigit,
      isASCIIAlpha,
      isASCIIAlphanumeric,
      isASCIIHex
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/encoding.js
var require_encoding = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/encoding.js"(exports, module2) {
    "use strict";
    init_define_process();
    var utf8Encoder = new TextEncoder();
    var utf8Decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    function utf8Encode(string) {
      return utf8Encoder.encode(string);
    }
    __name(utf8Encode, "utf8Encode");
    function utf8DecodeWithoutBOM(bytes) {
      return utf8Decoder.decode(bytes);
    }
    __name(utf8DecodeWithoutBOM, "utf8DecodeWithoutBOM");
    module2.exports = {
      utf8Encode,
      utf8DecodeWithoutBOM
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/percent-encoding.js
var require_percent_encoding = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/percent-encoding.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { isASCIIHex } = require_infra();
    var { utf8Encode } = require_encoding();
    function p(char) {
      return char.codePointAt(0);
    }
    __name(p, "p");
    function percentEncode(c) {
      let hex = c.toString(16).toUpperCase();
      if (hex.length === 1) {
        hex = `0${hex}`;
      }
      return `%${hex}`;
    }
    __name(percentEncode, "percentEncode");
    function percentDecodeBytes(input) {
      const output = new Uint8Array(input.byteLength);
      let outputIndex = 0;
      for (let i = 0; i < input.byteLength; ++i) {
        const byte = input[i];
        if (byte !== 37) {
          output[outputIndex++] = byte;
        } else if (byte === 37 && (!isASCIIHex(input[i + 1]) || !isASCIIHex(input[i + 2]))) {
          output[outputIndex++] = byte;
        } else {
          const bytePoint = parseInt(String.fromCodePoint(input[i + 1], input[i + 2]), 16);
          output[outputIndex++] = bytePoint;
          i += 2;
        }
      }
      return output.slice(0, outputIndex);
    }
    __name(percentDecodeBytes, "percentDecodeBytes");
    function percentDecodeString(input) {
      const bytes = utf8Encode(input);
      return percentDecodeBytes(bytes);
    }
    __name(percentDecodeString, "percentDecodeString");
    function isC0ControlPercentEncode(c) {
      return c <= 31 || c > 126;
    }
    __name(isC0ControlPercentEncode, "isC0ControlPercentEncode");
    var extraFragmentPercentEncodeSet = /* @__PURE__ */ new Set([p(" "), p('"'), p("<"), p(">"), p("`")]);
    function isFragmentPercentEncode(c) {
      return isC0ControlPercentEncode(c) || extraFragmentPercentEncodeSet.has(c);
    }
    __name(isFragmentPercentEncode, "isFragmentPercentEncode");
    var extraQueryPercentEncodeSet = /* @__PURE__ */ new Set([p(" "), p('"'), p("#"), p("<"), p(">")]);
    function isQueryPercentEncode(c) {
      return isC0ControlPercentEncode(c) || extraQueryPercentEncodeSet.has(c);
    }
    __name(isQueryPercentEncode, "isQueryPercentEncode");
    function isSpecialQueryPercentEncode(c) {
      return isQueryPercentEncode(c) || c === p("'");
    }
    __name(isSpecialQueryPercentEncode, "isSpecialQueryPercentEncode");
    var extraPathPercentEncodeSet = /* @__PURE__ */ new Set([p("?"), p("`"), p("{"), p("}")]);
    function isPathPercentEncode(c) {
      return isQueryPercentEncode(c) || extraPathPercentEncodeSet.has(c);
    }
    __name(isPathPercentEncode, "isPathPercentEncode");
    var extraUserinfoPercentEncodeSet = /* @__PURE__ */ new Set([p("/"), p(":"), p(";"), p("="), p("@"), p("["), p("\\"), p("]"), p("^"), p("|")]);
    function isUserinfoPercentEncode(c) {
      return isPathPercentEncode(c) || extraUserinfoPercentEncodeSet.has(c);
    }
    __name(isUserinfoPercentEncode, "isUserinfoPercentEncode");
    var extraComponentPercentEncodeSet = /* @__PURE__ */ new Set([p("$"), p("%"), p("&"), p("+"), p(",")]);
    function isComponentPercentEncode(c) {
      return isUserinfoPercentEncode(c) || extraComponentPercentEncodeSet.has(c);
    }
    __name(isComponentPercentEncode, "isComponentPercentEncode");
    var extraURLEncodedPercentEncodeSet = /* @__PURE__ */ new Set([p("!"), p("'"), p("("), p(")"), p("~")]);
    function isURLEncodedPercentEncode(c) {
      return isComponentPercentEncode(c) || extraURLEncodedPercentEncodeSet.has(c);
    }
    __name(isURLEncodedPercentEncode, "isURLEncodedPercentEncode");
    function utf8PercentEncodeCodePointInternal(codePoint, percentEncodePredicate) {
      const bytes = utf8Encode(codePoint);
      let output = "";
      for (const byte of bytes) {
        if (!percentEncodePredicate(byte)) {
          output += String.fromCharCode(byte);
        } else {
          output += percentEncode(byte);
        }
      }
      return output;
    }
    __name(utf8PercentEncodeCodePointInternal, "utf8PercentEncodeCodePointInternal");
    function utf8PercentEncodeCodePoint(codePoint, percentEncodePredicate) {
      return utf8PercentEncodeCodePointInternal(String.fromCodePoint(codePoint), percentEncodePredicate);
    }
    __name(utf8PercentEncodeCodePoint, "utf8PercentEncodeCodePoint");
    function utf8PercentEncodeString(input, percentEncodePredicate, spaceAsPlus = false) {
      let output = "";
      for (const codePoint of input) {
        if (spaceAsPlus && codePoint === " ") {
          output += "+";
        } else {
          output += utf8PercentEncodeCodePointInternal(codePoint, percentEncodePredicate);
        }
      }
      return output;
    }
    __name(utf8PercentEncodeString, "utf8PercentEncodeString");
    module2.exports = {
      isC0ControlPercentEncode,
      isFragmentPercentEncode,
      isQueryPercentEncode,
      isSpecialQueryPercentEncode,
      isPathPercentEncode,
      isUserinfoPercentEncode,
      isURLEncodedPercentEncode,
      percentDecodeString,
      percentDecodeBytes,
      utf8PercentEncodeString,
      utf8PercentEncodeCodePoint
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/url-state-machine.js
var require_url_state_machine = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/url-state-machine.js"(exports, module2) {
    "use strict";
    init_define_process();
    var tr46 = require_tr46();
    var infra = require_infra();
    var { utf8DecodeWithoutBOM } = require_encoding();
    var {
      percentDecodeString,
      utf8PercentEncodeCodePoint,
      utf8PercentEncodeString,
      isC0ControlPercentEncode,
      isFragmentPercentEncode,
      isQueryPercentEncode,
      isSpecialQueryPercentEncode,
      isPathPercentEncode,
      isUserinfoPercentEncode
    } = require_percent_encoding();
    function p(char) {
      return char.codePointAt(0);
    }
    __name(p, "p");
    var specialSchemes = {
      ftp: 21,
      file: null,
      http: 80,
      https: 443,
      ws: 80,
      wss: 443
    };
    var failure = Symbol("failure");
    function countSymbols(str) {
      return [...str].length;
    }
    __name(countSymbols, "countSymbols");
    function at(input, idx) {
      const c = input[idx];
      return isNaN(c) ? void 0 : String.fromCodePoint(c);
    }
    __name(at, "at");
    function isSingleDot(buffer) {
      return buffer === "." || buffer.toLowerCase() === "%2e";
    }
    __name(isSingleDot, "isSingleDot");
    function isDoubleDot(buffer) {
      buffer = buffer.toLowerCase();
      return buffer === ".." || buffer === "%2e." || buffer === ".%2e" || buffer === "%2e%2e";
    }
    __name(isDoubleDot, "isDoubleDot");
    function isWindowsDriveLetterCodePoints(cp1, cp2) {
      return infra.isASCIIAlpha(cp1) && (cp2 === p(":") || cp2 === p("|"));
    }
    __name(isWindowsDriveLetterCodePoints, "isWindowsDriveLetterCodePoints");
    function isWindowsDriveLetterString(string) {
      return string.length === 2 && infra.isASCIIAlpha(string.codePointAt(0)) && (string[1] === ":" || string[1] === "|");
    }
    __name(isWindowsDriveLetterString, "isWindowsDriveLetterString");
    function isNormalizedWindowsDriveLetterString(string) {
      return string.length === 2 && infra.isASCIIAlpha(string.codePointAt(0)) && string[1] === ":";
    }
    __name(isNormalizedWindowsDriveLetterString, "isNormalizedWindowsDriveLetterString");
    function containsForbiddenHostCodePoint(string) {
      return string.search(/\u0000|\u0009|\u000A|\u000D|\u0020|#|%|\/|:|<|>|\?|@|\[|\\|\]|\^|\|/u) !== -1;
    }
    __name(containsForbiddenHostCodePoint, "containsForbiddenHostCodePoint");
    function containsForbiddenHostCodePointExcludingPercent(string) {
      return string.search(/\u0000|\u0009|\u000A|\u000D|\u0020|#|\/|:|<|>|\?|@|\[|\\|\]|\^|\|/u) !== -1;
    }
    __name(containsForbiddenHostCodePointExcludingPercent, "containsForbiddenHostCodePointExcludingPercent");
    function isSpecialScheme2(scheme) {
      return specialSchemes[scheme] !== void 0;
    }
    __name(isSpecialScheme2, "isSpecialScheme");
    function isSpecial(url) {
      return isSpecialScheme2(url.scheme);
    }
    __name(isSpecial, "isSpecial");
    function isNotSpecial(url) {
      return !isSpecialScheme2(url.scheme);
    }
    __name(isNotSpecial, "isNotSpecial");
    function defaultPort(scheme) {
      return specialSchemes[scheme];
    }
    __name(defaultPort, "defaultPort");
    function parseIPv4Number(input) {
      if (input === "") {
        return failure;
      }
      let R = 10;
      if (input.length >= 2 && input.charAt(0) === "0" && input.charAt(1).toLowerCase() === "x") {
        input = input.substring(2);
        R = 16;
      } else if (input.length >= 2 && input.charAt(0) === "0") {
        input = input.substring(1);
        R = 8;
      }
      if (input === "") {
        return 0;
      }
      let regex = /[^0-7]/u;
      if (R === 10) {
        regex = /[^0-9]/u;
      }
      if (R === 16) {
        regex = /[^0-9A-Fa-f]/u;
      }
      if (regex.test(input)) {
        return failure;
      }
      return parseInt(input, R);
    }
    __name(parseIPv4Number, "parseIPv4Number");
    function parseIPv4(input) {
      const parts = input.split(".");
      if (parts[parts.length - 1] === "") {
        if (parts.length > 1) {
          parts.pop();
        }
      }
      if (parts.length > 4) {
        return failure;
      }
      const numbers = [];
      for (const part of parts) {
        const n = parseIPv4Number(part);
        if (n === failure) {
          return failure;
        }
        numbers.push(n);
      }
      for (let i = 0; i < numbers.length - 1; ++i) {
        if (numbers[i] > 255) {
          return failure;
        }
      }
      if (numbers[numbers.length - 1] >= 256 ** (5 - numbers.length)) {
        return failure;
      }
      let ipv4 = numbers.pop();
      let counter = 0;
      for (const n of numbers) {
        ipv4 += n * 256 ** (3 - counter);
        ++counter;
      }
      return ipv4;
    }
    __name(parseIPv4, "parseIPv4");
    function serializeIPv4(address) {
      let output = "";
      let n = address;
      for (let i = 1; i <= 4; ++i) {
        output = String(n % 256) + output;
        if (i !== 4) {
          output = `.${output}`;
        }
        n = Math.floor(n / 256);
      }
      return output;
    }
    __name(serializeIPv4, "serializeIPv4");
    function parseIPv6(input) {
      const address = [0, 0, 0, 0, 0, 0, 0, 0];
      let pieceIndex = 0;
      let compress = null;
      let pointer = 0;
      input = Array.from(input, (c) => c.codePointAt(0));
      if (input[pointer] === p(":")) {
        if (input[pointer + 1] !== p(":")) {
          return failure;
        }
        pointer += 2;
        ++pieceIndex;
        compress = pieceIndex;
      }
      while (pointer < input.length) {
        if (pieceIndex === 8) {
          return failure;
        }
        if (input[pointer] === p(":")) {
          if (compress !== null) {
            return failure;
          }
          ++pointer;
          ++pieceIndex;
          compress = pieceIndex;
          continue;
        }
        let value = 0;
        let length = 0;
        while (length < 4 && infra.isASCIIHex(input[pointer])) {
          value = value * 16 + parseInt(at(input, pointer), 16);
          ++pointer;
          ++length;
        }
        if (input[pointer] === p(".")) {
          if (length === 0) {
            return failure;
          }
          pointer -= length;
          if (pieceIndex > 6) {
            return failure;
          }
          let numbersSeen = 0;
          while (input[pointer] !== void 0) {
            let ipv4Piece = null;
            if (numbersSeen > 0) {
              if (input[pointer] === p(".") && numbersSeen < 4) {
                ++pointer;
              } else {
                return failure;
              }
            }
            if (!infra.isASCIIDigit(input[pointer])) {
              return failure;
            }
            while (infra.isASCIIDigit(input[pointer])) {
              const number = parseInt(at(input, pointer));
              if (ipv4Piece === null) {
                ipv4Piece = number;
              } else if (ipv4Piece === 0) {
                return failure;
              } else {
                ipv4Piece = ipv4Piece * 10 + number;
              }
              if (ipv4Piece > 255) {
                return failure;
              }
              ++pointer;
            }
            address[pieceIndex] = address[pieceIndex] * 256 + ipv4Piece;
            ++numbersSeen;
            if (numbersSeen === 2 || numbersSeen === 4) {
              ++pieceIndex;
            }
          }
          if (numbersSeen !== 4) {
            return failure;
          }
          break;
        } else if (input[pointer] === p(":")) {
          ++pointer;
          if (input[pointer] === void 0) {
            return failure;
          }
        } else if (input[pointer] !== void 0) {
          return failure;
        }
        address[pieceIndex] = value;
        ++pieceIndex;
      }
      if (compress !== null) {
        let swaps = pieceIndex - compress;
        pieceIndex = 7;
        while (pieceIndex !== 0 && swaps > 0) {
          const temp = address[compress + swaps - 1];
          address[compress + swaps - 1] = address[pieceIndex];
          address[pieceIndex] = temp;
          --pieceIndex;
          --swaps;
        }
      } else if (compress === null && pieceIndex !== 8) {
        return failure;
      }
      return address;
    }
    __name(parseIPv6, "parseIPv6");
    function serializeIPv6(address) {
      let output = "";
      const compress = findLongestZeroSequence(address);
      let ignore0 = false;
      for (let pieceIndex = 0; pieceIndex <= 7; ++pieceIndex) {
        if (ignore0 && address[pieceIndex] === 0) {
          continue;
        } else if (ignore0) {
          ignore0 = false;
        }
        if (compress === pieceIndex) {
          const separator = pieceIndex === 0 ? "::" : ":";
          output += separator;
          ignore0 = true;
          continue;
        }
        output += address[pieceIndex].toString(16);
        if (pieceIndex !== 7) {
          output += ":";
        }
      }
      return output;
    }
    __name(serializeIPv6, "serializeIPv6");
    function parseHost(input, isNotSpecialArg = false) {
      if (input[0] === "[") {
        if (input[input.length - 1] !== "]") {
          return failure;
        }
        return parseIPv6(input.substring(1, input.length - 1));
      }
      if (isNotSpecialArg) {
        return parseOpaqueHost(input);
      }
      const domain = utf8DecodeWithoutBOM(percentDecodeString(input));
      const asciiDomain = domainToASCII(domain);
      if (asciiDomain === failure) {
        return failure;
      }
      if (containsForbiddenHostCodePoint(asciiDomain)) {
        return failure;
      }
      if (endsInANumber(asciiDomain)) {
        return parseIPv4(asciiDomain);
      }
      return asciiDomain;
    }
    __name(parseHost, "parseHost");
    function endsInANumber(input) {
      const parts = input.split(".");
      if (parts[parts.length - 1] === "") {
        if (parts.length === 1) {
          return false;
        }
        parts.pop();
      }
      const last = parts[parts.length - 1];
      if (parseIPv4Number(last) !== failure) {
        return true;
      }
      if (/^[0-9]+$/u.test(last)) {
        return true;
      }
      return false;
    }
    __name(endsInANumber, "endsInANumber");
    function parseOpaqueHost(input) {
      if (containsForbiddenHostCodePointExcludingPercent(input)) {
        return failure;
      }
      return utf8PercentEncodeString(input, isC0ControlPercentEncode);
    }
    __name(parseOpaqueHost, "parseOpaqueHost");
    function findLongestZeroSequence(arr) {
      let maxIdx = null;
      let maxLen = 1;
      let currStart = null;
      let currLen = 0;
      for (let i = 0; i < arr.length; ++i) {
        if (arr[i] !== 0) {
          if (currLen > maxLen) {
            maxIdx = currStart;
            maxLen = currLen;
          }
          currStart = null;
          currLen = 0;
        } else {
          if (currStart === null) {
            currStart = i;
          }
          ++currLen;
        }
      }
      if (currLen > maxLen) {
        return currStart;
      }
      return maxIdx;
    }
    __name(findLongestZeroSequence, "findLongestZeroSequence");
    function serializeHost(host) {
      if (typeof host === "number") {
        return serializeIPv4(host);
      }
      if (host instanceof Array) {
        return `[${serializeIPv6(host)}]`;
      }
      return host;
    }
    __name(serializeHost, "serializeHost");
    function domainToASCII(domain, beStrict = false) {
      const result = tr46.toASCII(domain, {
        checkBidi: true,
        checkHyphens: false,
        checkJoiners: true,
        useSTD3ASCIIRules: beStrict,
        verifyDNSLength: beStrict
      });
      if (result === null || result === "") {
        return failure;
      }
      return result;
    }
    __name(domainToASCII, "domainToASCII");
    function trimControlChars(url) {
      return url.replace(/^[\u0000-\u001F\u0020]+|[\u0000-\u001F\u0020]+$/ug, "");
    }
    __name(trimControlChars, "trimControlChars");
    function trimTabAndNewline(url) {
      return url.replace(/\u0009|\u000A|\u000D/ug, "");
    }
    __name(trimTabAndNewline, "trimTabAndNewline");
    function shortenPath(url) {
      const { path } = url;
      if (path.length === 0) {
        return;
      }
      if (url.scheme === "file" && path.length === 1 && isNormalizedWindowsDriveLetter(path[0])) {
        return;
      }
      path.pop();
    }
    __name(shortenPath, "shortenPath");
    function includesCredentials(url) {
      return url.username !== "" || url.password !== "";
    }
    __name(includesCredentials, "includesCredentials");
    function cannotHaveAUsernamePasswordPort(url) {
      return url.host === null || url.host === "" || hasAnOpaquePath(url) || url.scheme === "file";
    }
    __name(cannotHaveAUsernamePasswordPort, "cannotHaveAUsernamePasswordPort");
    function hasAnOpaquePath(url) {
      return typeof url.path === "string";
    }
    __name(hasAnOpaquePath, "hasAnOpaquePath");
    function isNormalizedWindowsDriveLetter(string) {
      return /^[A-Za-z]:$/u.test(string);
    }
    __name(isNormalizedWindowsDriveLetter, "isNormalizedWindowsDriveLetter");
    function URLStateMachine(input, base, encodingOverride, url, stateOverride) {
      this.pointer = 0;
      this.input = input;
      this.base = base || null;
      this.encodingOverride = encodingOverride || "utf-8";
      this.stateOverride = stateOverride;
      this.url = url;
      this.failure = false;
      this.parseError = false;
      if (!this.url) {
        this.url = {
          scheme: "",
          username: "",
          password: "",
          host: null,
          port: null,
          path: [],
          query: null,
          fragment: null
        };
        const res2 = trimControlChars(this.input);
        if (res2 !== this.input) {
          this.parseError = true;
        }
        this.input = res2;
      }
      const res = trimTabAndNewline(this.input);
      if (res !== this.input) {
        this.parseError = true;
      }
      this.input = res;
      this.state = stateOverride || "scheme start";
      this.buffer = "";
      this.atFlag = false;
      this.arrFlag = false;
      this.passwordTokenSeenFlag = false;
      this.input = Array.from(this.input, (c) => c.codePointAt(0));
      for (; this.pointer <= this.input.length; ++this.pointer) {
        const c = this.input[this.pointer];
        const cStr = isNaN(c) ? void 0 : String.fromCodePoint(c);
        const ret = this[`parse ${this.state}`](c, cStr);
        if (!ret) {
          break;
        } else if (ret === failure) {
          this.failure = true;
          break;
        }
      }
    }
    __name(URLStateMachine, "URLStateMachine");
    URLStateMachine.prototype["parse scheme start"] = /* @__PURE__ */ __name(function parseSchemeStart(c, cStr) {
      if (infra.isASCIIAlpha(c)) {
        this.buffer += cStr.toLowerCase();
        this.state = "scheme";
      } else if (!this.stateOverride) {
        this.state = "no scheme";
        --this.pointer;
      } else {
        this.parseError = true;
        return failure;
      }
      return true;
    }, "parseSchemeStart");
    URLStateMachine.prototype["parse scheme"] = /* @__PURE__ */ __name(function parseScheme(c, cStr) {
      if (infra.isASCIIAlphanumeric(c) || c === p("+") || c === p("-") || c === p(".")) {
        this.buffer += cStr.toLowerCase();
      } else if (c === p(":")) {
        if (this.stateOverride) {
          if (isSpecial(this.url) && !isSpecialScheme2(this.buffer)) {
            return false;
          }
          if (!isSpecial(this.url) && isSpecialScheme2(this.buffer)) {
            return false;
          }
          if ((includesCredentials(this.url) || this.url.port !== null) && this.buffer === "file") {
            return false;
          }
          if (this.url.scheme === "file" && this.url.host === "") {
            return false;
          }
        }
        this.url.scheme = this.buffer;
        if (this.stateOverride) {
          if (this.url.port === defaultPort(this.url.scheme)) {
            this.url.port = null;
          }
          return false;
        }
        this.buffer = "";
        if (this.url.scheme === "file") {
          if (this.input[this.pointer + 1] !== p("/") || this.input[this.pointer + 2] !== p("/")) {
            this.parseError = true;
          }
          this.state = "file";
        } else if (isSpecial(this.url) && this.base !== null && this.base.scheme === this.url.scheme) {
          this.state = "special relative or authority";
        } else if (isSpecial(this.url)) {
          this.state = "special authority slashes";
        } else if (this.input[this.pointer + 1] === p("/")) {
          this.state = "path or authority";
          ++this.pointer;
        } else {
          this.url.path = "";
          this.state = "opaque path";
        }
      } else if (!this.stateOverride) {
        this.buffer = "";
        this.state = "no scheme";
        this.pointer = -1;
      } else {
        this.parseError = true;
        return failure;
      }
      return true;
    }, "parseScheme");
    URLStateMachine.prototype["parse no scheme"] = /* @__PURE__ */ __name(function parseNoScheme(c) {
      if (this.base === null || hasAnOpaquePath(this.base) && c !== p("#")) {
        return failure;
      } else if (hasAnOpaquePath(this.base) && c === p("#")) {
        this.url.scheme = this.base.scheme;
        this.url.path = this.base.path;
        this.url.query = this.base.query;
        this.url.fragment = "";
        this.state = "fragment";
      } else if (this.base.scheme === "file") {
        this.state = "file";
        --this.pointer;
      } else {
        this.state = "relative";
        --this.pointer;
      }
      return true;
    }, "parseNoScheme");
    URLStateMachine.prototype["parse special relative or authority"] = /* @__PURE__ */ __name(function parseSpecialRelativeOrAuthority(c) {
      if (c === p("/") && this.input[this.pointer + 1] === p("/")) {
        this.state = "special authority ignore slashes";
        ++this.pointer;
      } else {
        this.parseError = true;
        this.state = "relative";
        --this.pointer;
      }
      return true;
    }, "parseSpecialRelativeOrAuthority");
    URLStateMachine.prototype["parse path or authority"] = /* @__PURE__ */ __name(function parsePathOrAuthority(c) {
      if (c === p("/")) {
        this.state = "authority";
      } else {
        this.state = "path";
        --this.pointer;
      }
      return true;
    }, "parsePathOrAuthority");
    URLStateMachine.prototype["parse relative"] = /* @__PURE__ */ __name(function parseRelative(c) {
      this.url.scheme = this.base.scheme;
      if (c === p("/")) {
        this.state = "relative slash";
      } else if (isSpecial(this.url) && c === p("\\")) {
        this.parseError = true;
        this.state = "relative slash";
      } else {
        this.url.username = this.base.username;
        this.url.password = this.base.password;
        this.url.host = this.base.host;
        this.url.port = this.base.port;
        this.url.path = this.base.path.slice();
        this.url.query = this.base.query;
        if (c === p("?")) {
          this.url.query = "";
          this.state = "query";
        } else if (c === p("#")) {
          this.url.fragment = "";
          this.state = "fragment";
        } else if (!isNaN(c)) {
          this.url.query = null;
          this.url.path.pop();
          this.state = "path";
          --this.pointer;
        }
      }
      return true;
    }, "parseRelative");
    URLStateMachine.prototype["parse relative slash"] = /* @__PURE__ */ __name(function parseRelativeSlash(c) {
      if (isSpecial(this.url) && (c === p("/") || c === p("\\"))) {
        if (c === p("\\")) {
          this.parseError = true;
        }
        this.state = "special authority ignore slashes";
      } else if (c === p("/")) {
        this.state = "authority";
      } else {
        this.url.username = this.base.username;
        this.url.password = this.base.password;
        this.url.host = this.base.host;
        this.url.port = this.base.port;
        this.state = "path";
        --this.pointer;
      }
      return true;
    }, "parseRelativeSlash");
    URLStateMachine.prototype["parse special authority slashes"] = /* @__PURE__ */ __name(function parseSpecialAuthoritySlashes(c) {
      if (c === p("/") && this.input[this.pointer + 1] === p("/")) {
        this.state = "special authority ignore slashes";
        ++this.pointer;
      } else {
        this.parseError = true;
        this.state = "special authority ignore slashes";
        --this.pointer;
      }
      return true;
    }, "parseSpecialAuthoritySlashes");
    URLStateMachine.prototype["parse special authority ignore slashes"] = /* @__PURE__ */ __name(function parseSpecialAuthorityIgnoreSlashes(c) {
      if (c !== p("/") && c !== p("\\")) {
        this.state = "authority";
        --this.pointer;
      } else {
        this.parseError = true;
      }
      return true;
    }, "parseSpecialAuthorityIgnoreSlashes");
    URLStateMachine.prototype["parse authority"] = /* @__PURE__ */ __name(function parseAuthority(c, cStr) {
      if (c === p("@")) {
        this.parseError = true;
        if (this.atFlag) {
          this.buffer = `%40${this.buffer}`;
        }
        this.atFlag = true;
        const len = countSymbols(this.buffer);
        for (let pointer = 0; pointer < len; ++pointer) {
          const codePoint = this.buffer.codePointAt(pointer);
          if (codePoint === p(":") && !this.passwordTokenSeenFlag) {
            this.passwordTokenSeenFlag = true;
            continue;
          }
          const encodedCodePoints = utf8PercentEncodeCodePoint(codePoint, isUserinfoPercentEncode);
          if (this.passwordTokenSeenFlag) {
            this.url.password += encodedCodePoints;
          } else {
            this.url.username += encodedCodePoints;
          }
        }
        this.buffer = "";
      } else if (isNaN(c) || c === p("/") || c === p("?") || c === p("#") || isSpecial(this.url) && c === p("\\")) {
        if (this.atFlag && this.buffer === "") {
          this.parseError = true;
          return failure;
        }
        this.pointer -= countSymbols(this.buffer) + 1;
        this.buffer = "";
        this.state = "host";
      } else {
        this.buffer += cStr;
      }
      return true;
    }, "parseAuthority");
    URLStateMachine.prototype["parse hostname"] = URLStateMachine.prototype["parse host"] = /* @__PURE__ */ __name(function parseHostName(c, cStr) {
      if (this.stateOverride && this.url.scheme === "file") {
        --this.pointer;
        this.state = "file host";
      } else if (c === p(":") && !this.arrFlag) {
        if (this.buffer === "") {
          this.parseError = true;
          return failure;
        }
        if (this.stateOverride === "hostname") {
          return false;
        }
        const host = parseHost(this.buffer, isNotSpecial(this.url));
        if (host === failure) {
          return failure;
        }
        this.url.host = host;
        this.buffer = "";
        this.state = "port";
      } else if (isNaN(c) || c === p("/") || c === p("?") || c === p("#") || isSpecial(this.url) && c === p("\\")) {
        --this.pointer;
        if (isSpecial(this.url) && this.buffer === "") {
          this.parseError = true;
          return failure;
        } else if (this.stateOverride && this.buffer === "" && (includesCredentials(this.url) || this.url.port !== null)) {
          this.parseError = true;
          return false;
        }
        const host = parseHost(this.buffer, isNotSpecial(this.url));
        if (host === failure) {
          return failure;
        }
        this.url.host = host;
        this.buffer = "";
        this.state = "path start";
        if (this.stateOverride) {
          return false;
        }
      } else {
        if (c === p("[")) {
          this.arrFlag = true;
        } else if (c === p("]")) {
          this.arrFlag = false;
        }
        this.buffer += cStr;
      }
      return true;
    }, "parseHostName");
    URLStateMachine.prototype["parse port"] = /* @__PURE__ */ __name(function parsePort(c, cStr) {
      if (infra.isASCIIDigit(c)) {
        this.buffer += cStr;
      } else if (isNaN(c) || c === p("/") || c === p("?") || c === p("#") || isSpecial(this.url) && c === p("\\") || this.stateOverride) {
        if (this.buffer !== "") {
          const port = parseInt(this.buffer);
          if (port > 2 ** 16 - 1) {
            this.parseError = true;
            return failure;
          }
          this.url.port = port === defaultPort(this.url.scheme) ? null : port;
          this.buffer = "";
        }
        if (this.stateOverride) {
          return false;
        }
        this.state = "path start";
        --this.pointer;
      } else {
        this.parseError = true;
        return failure;
      }
      return true;
    }, "parsePort");
    var fileOtherwiseCodePoints = /* @__PURE__ */ new Set([p("/"), p("\\"), p("?"), p("#")]);
    function startsWithWindowsDriveLetter(input, pointer) {
      const length = input.length - pointer;
      return length >= 2 && isWindowsDriveLetterCodePoints(input[pointer], input[pointer + 1]) && (length === 2 || fileOtherwiseCodePoints.has(input[pointer + 2]));
    }
    __name(startsWithWindowsDriveLetter, "startsWithWindowsDriveLetter");
    URLStateMachine.prototype["parse file"] = /* @__PURE__ */ __name(function parseFile(c) {
      this.url.scheme = "file";
      this.url.host = "";
      if (c === p("/") || c === p("\\")) {
        if (c === p("\\")) {
          this.parseError = true;
        }
        this.state = "file slash";
      } else if (this.base !== null && this.base.scheme === "file") {
        this.url.host = this.base.host;
        this.url.path = this.base.path.slice();
        this.url.query = this.base.query;
        if (c === p("?")) {
          this.url.query = "";
          this.state = "query";
        } else if (c === p("#")) {
          this.url.fragment = "";
          this.state = "fragment";
        } else if (!isNaN(c)) {
          this.url.query = null;
          if (!startsWithWindowsDriveLetter(this.input, this.pointer)) {
            shortenPath(this.url);
          } else {
            this.parseError = true;
            this.url.path = [];
          }
          this.state = "path";
          --this.pointer;
        }
      } else {
        this.state = "path";
        --this.pointer;
      }
      return true;
    }, "parseFile");
    URLStateMachine.prototype["parse file slash"] = /* @__PURE__ */ __name(function parseFileSlash(c) {
      if (c === p("/") || c === p("\\")) {
        if (c === p("\\")) {
          this.parseError = true;
        }
        this.state = "file host";
      } else {
        if (this.base !== null && this.base.scheme === "file") {
          if (!startsWithWindowsDriveLetter(this.input, this.pointer) && isNormalizedWindowsDriveLetterString(this.base.path[0])) {
            this.url.path.push(this.base.path[0]);
          }
          this.url.host = this.base.host;
        }
        this.state = "path";
        --this.pointer;
      }
      return true;
    }, "parseFileSlash");
    URLStateMachine.prototype["parse file host"] = /* @__PURE__ */ __name(function parseFileHost(c, cStr) {
      if (isNaN(c) || c === p("/") || c === p("\\") || c === p("?") || c === p("#")) {
        --this.pointer;
        if (!this.stateOverride && isWindowsDriveLetterString(this.buffer)) {
          this.parseError = true;
          this.state = "path";
        } else if (this.buffer === "") {
          this.url.host = "";
          if (this.stateOverride) {
            return false;
          }
          this.state = "path start";
        } else {
          let host = parseHost(this.buffer, isNotSpecial(this.url));
          if (host === failure) {
            return failure;
          }
          if (host === "localhost") {
            host = "";
          }
          this.url.host = host;
          if (this.stateOverride) {
            return false;
          }
          this.buffer = "";
          this.state = "path start";
        }
      } else {
        this.buffer += cStr;
      }
      return true;
    }, "parseFileHost");
    URLStateMachine.prototype["parse path start"] = /* @__PURE__ */ __name(function parsePathStart(c) {
      if (isSpecial(this.url)) {
        if (c === p("\\")) {
          this.parseError = true;
        }
        this.state = "path";
        if (c !== p("/") && c !== p("\\")) {
          --this.pointer;
        }
      } else if (!this.stateOverride && c === p("?")) {
        this.url.query = "";
        this.state = "query";
      } else if (!this.stateOverride && c === p("#")) {
        this.url.fragment = "";
        this.state = "fragment";
      } else if (c !== void 0) {
        this.state = "path";
        if (c !== p("/")) {
          --this.pointer;
        }
      } else if (this.stateOverride && this.url.host === null) {
        this.url.path.push("");
      }
      return true;
    }, "parsePathStart");
    URLStateMachine.prototype["parse path"] = /* @__PURE__ */ __name(function parsePath(c) {
      if (isNaN(c) || c === p("/") || isSpecial(this.url) && c === p("\\") || !this.stateOverride && (c === p("?") || c === p("#"))) {
        if (isSpecial(this.url) && c === p("\\")) {
          this.parseError = true;
        }
        if (isDoubleDot(this.buffer)) {
          shortenPath(this.url);
          if (c !== p("/") && !(isSpecial(this.url) && c === p("\\"))) {
            this.url.path.push("");
          }
        } else if (isSingleDot(this.buffer) && c !== p("/") && !(isSpecial(this.url) && c === p("\\"))) {
          this.url.path.push("");
        } else if (!isSingleDot(this.buffer)) {
          if (this.url.scheme === "file" && this.url.path.length === 0 && isWindowsDriveLetterString(this.buffer)) {
            this.buffer = `${this.buffer[0]}:`;
          }
          this.url.path.push(this.buffer);
        }
        this.buffer = "";
        if (c === p("?")) {
          this.url.query = "";
          this.state = "query";
        }
        if (c === p("#")) {
          this.url.fragment = "";
          this.state = "fragment";
        }
      } else {
        if (c === p("%") && (!infra.isASCIIHex(this.input[this.pointer + 1]) || !infra.isASCIIHex(this.input[this.pointer + 2]))) {
          this.parseError = true;
        }
        this.buffer += utf8PercentEncodeCodePoint(c, isPathPercentEncode);
      }
      return true;
    }, "parsePath");
    URLStateMachine.prototype["parse opaque path"] = /* @__PURE__ */ __name(function parseOpaquePath(c) {
      if (c === p("?")) {
        this.url.query = "";
        this.state = "query";
      } else if (c === p("#")) {
        this.url.fragment = "";
        this.state = "fragment";
      } else {
        if (!isNaN(c) && c !== p("%")) {
          this.parseError = true;
        }
        if (c === p("%") && (!infra.isASCIIHex(this.input[this.pointer + 1]) || !infra.isASCIIHex(this.input[this.pointer + 2]))) {
          this.parseError = true;
        }
        if (!isNaN(c)) {
          this.url.path += utf8PercentEncodeCodePoint(c, isC0ControlPercentEncode);
        }
      }
      return true;
    }, "parseOpaquePath");
    URLStateMachine.prototype["parse query"] = /* @__PURE__ */ __name(function parseQuery(c, cStr) {
      if (!isSpecial(this.url) || this.url.scheme === "ws" || this.url.scheme === "wss") {
        this.encodingOverride = "utf-8";
      }
      if (!this.stateOverride && c === p("#") || isNaN(c)) {
        const queryPercentEncodePredicate = isSpecial(this.url) ? isSpecialQueryPercentEncode : isQueryPercentEncode;
        this.url.query += utf8PercentEncodeString(this.buffer, queryPercentEncodePredicate);
        this.buffer = "";
        if (c === p("#")) {
          this.url.fragment = "";
          this.state = "fragment";
        }
      } else if (!isNaN(c)) {
        if (c === p("%") && (!infra.isASCIIHex(this.input[this.pointer + 1]) || !infra.isASCIIHex(this.input[this.pointer + 2]))) {
          this.parseError = true;
        }
        this.buffer += cStr;
      }
      return true;
    }, "parseQuery");
    URLStateMachine.prototype["parse fragment"] = /* @__PURE__ */ __name(function parseFragment(c) {
      if (!isNaN(c)) {
        if (c === p("%") && (!infra.isASCIIHex(this.input[this.pointer + 1]) || !infra.isASCIIHex(this.input[this.pointer + 2]))) {
          this.parseError = true;
        }
        this.url.fragment += utf8PercentEncodeCodePoint(c, isFragmentPercentEncode);
      }
      return true;
    }, "parseFragment");
    function serializeURL(url, excludeFragment) {
      let output = `${url.scheme}:`;
      if (url.host !== null) {
        output += "//";
        if (url.username !== "" || url.password !== "") {
          output += url.username;
          if (url.password !== "") {
            output += `:${url.password}`;
          }
          output += "@";
        }
        output += serializeHost(url.host);
        if (url.port !== null) {
          output += `:${url.port}`;
        }
      }
      if (url.host === null && !hasAnOpaquePath(url) && url.path.length > 1 && url.path[0] === "") {
        output += "/.";
      }
      output += serializePath(url);
      if (url.query !== null) {
        output += `?${url.query}`;
      }
      if (!excludeFragment && url.fragment !== null) {
        output += `#${url.fragment}`;
      }
      return output;
    }
    __name(serializeURL, "serializeURL");
    function serializeOrigin(tuple) {
      let result = `${tuple.scheme}://`;
      result += serializeHost(tuple.host);
      if (tuple.port !== null) {
        result += `:${tuple.port}`;
      }
      return result;
    }
    __name(serializeOrigin, "serializeOrigin");
    function serializePath(url) {
      if (hasAnOpaquePath(url)) {
        return url.path;
      }
      let output = "";
      for (const segment of url.path) {
        output += `/${segment}`;
      }
      return output;
    }
    __name(serializePath, "serializePath");
    module2.exports.serializeURL = serializeURL;
    module2.exports.serializePath = serializePath;
    module2.exports.serializeURLOrigin = function(url) {
      switch (url.scheme) {
        case "blob":
          try {
            return module2.exports.serializeURLOrigin(module2.exports.parseURL(serializePath(url)));
          } catch (e) {
            return "null";
          }
        case "ftp":
        case "http":
        case "https":
        case "ws":
        case "wss":
          return serializeOrigin({
            scheme: url.scheme,
            host: url.host,
            port: url.port
          });
        case "file":
          return "null";
        default:
          return "null";
      }
    };
    module2.exports.basicURLParse = function(input, options) {
      if (options === void 0) {
        options = {};
      }
      const usm = new URLStateMachine(input, options.baseURL, options.encodingOverride, options.url, options.stateOverride);
      if (usm.failure) {
        return null;
      }
      return usm.url;
    };
    module2.exports.setTheUsername = function(url, username) {
      url.username = utf8PercentEncodeString(username, isUserinfoPercentEncode);
    };
    module2.exports.setThePassword = function(url, password) {
      url.password = utf8PercentEncodeString(password, isUserinfoPercentEncode);
    };
    module2.exports.serializeHost = serializeHost;
    module2.exports.cannotHaveAUsernamePasswordPort = cannotHaveAUsernamePasswordPort;
    module2.exports.hasAnOpaquePath = hasAnOpaquePath;
    module2.exports.serializeInteger = function(integer) {
      return String(integer);
    };
    module2.exports.parseURL = function(input, options) {
      if (options === void 0) {
        options = {};
      }
      return module2.exports.basicURLParse(input, { baseURL: options.baseURL, encodingOverride: options.encodingOverride });
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/urlencoded.js
var require_urlencoded = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/urlencoded.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { utf8Encode, utf8DecodeWithoutBOM } = require_encoding();
    var { percentDecodeBytes, utf8PercentEncodeString, isURLEncodedPercentEncode } = require_percent_encoding();
    function p(char) {
      return char.codePointAt(0);
    }
    __name(p, "p");
    function parseUrlencoded(input) {
      const sequences = strictlySplitByteSequence(input, p("&"));
      const output = [];
      for (const bytes of sequences) {
        if (bytes.length === 0) {
          continue;
        }
        let name, value;
        const indexOfEqual = bytes.indexOf(p("="));
        if (indexOfEqual >= 0) {
          name = bytes.slice(0, indexOfEqual);
          value = bytes.slice(indexOfEqual + 1);
        } else {
          name = bytes;
          value = new Uint8Array(0);
        }
        name = replaceByteInByteSequence(name, 43, 32);
        value = replaceByteInByteSequence(value, 43, 32);
        const nameString = utf8DecodeWithoutBOM(percentDecodeBytes(name));
        const valueString = utf8DecodeWithoutBOM(percentDecodeBytes(value));
        output.push([nameString, valueString]);
      }
      return output;
    }
    __name(parseUrlencoded, "parseUrlencoded");
    function parseUrlencodedString(input) {
      return parseUrlencoded(utf8Encode(input));
    }
    __name(parseUrlencodedString, "parseUrlencodedString");
    function serializeUrlencoded(tuples, encodingOverride = void 0) {
      let encoding = "utf-8";
      if (encodingOverride !== void 0) {
        encoding = encodingOverride;
      }
      let output = "";
      for (const [i, tuple] of tuples.entries()) {
        const name = utf8PercentEncodeString(tuple[0], isURLEncodedPercentEncode, true);
        let value = tuple[1];
        if (tuple.length > 2 && tuple[2] !== void 0) {
          if (tuple[2] === "hidden" && name === "_charset_") {
            value = encoding;
          } else if (tuple[2] === "file") {
            value = value.name;
          }
        }
        value = utf8PercentEncodeString(value, isURLEncodedPercentEncode, true);
        if (i !== 0) {
          output += "&";
        }
        output += `${name}=${value}`;
      }
      return output;
    }
    __name(serializeUrlencoded, "serializeUrlencoded");
    function strictlySplitByteSequence(buf, cp) {
      const list = [];
      let last = 0;
      let i = buf.indexOf(cp);
      while (i >= 0) {
        list.push(buf.slice(last, i));
        last = i + 1;
        i = buf.indexOf(cp, last);
      }
      if (last !== buf.length) {
        list.push(buf.slice(last));
      }
      return list;
    }
    __name(strictlySplitByteSequence, "strictlySplitByteSequence");
    function replaceByteInByteSequence(buf, from, to) {
      let i = buf.indexOf(from);
      while (i >= 0) {
        buf[i] = to;
        i = buf.indexOf(from, i + 1);
      }
      return buf;
    }
    __name(replaceByteInByteSequence, "replaceByteInByteSequence");
    module2.exports = {
      parseUrlencodedString,
      serializeUrlencoded
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/Function.js
var require_Function = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/Function.js"(exports) {
    "use strict";
    init_define_process();
    var conversions = require_lib();
    var utils = require_utils();
    exports.convert = (globalObject, value, { context = "The provided value" } = {}) => {
      if (typeof value !== "function") {
        throw new globalObject.TypeError(context + " is not a function");
      }
      function invokeTheCallbackFunction(...args) {
        const thisArg = utils.tryWrapperForImpl(this);
        let callResult;
        for (let i = 0; i < args.length; i++) {
          args[i] = utils.tryWrapperForImpl(args[i]);
        }
        callResult = Reflect.apply(value, thisArg, args);
        callResult = conversions["any"](callResult, { context, globals: globalObject });
        return callResult;
      }
      __name(invokeTheCallbackFunction, "invokeTheCallbackFunction");
      invokeTheCallbackFunction.construct = (...args) => {
        for (let i = 0; i < args.length; i++) {
          args[i] = utils.tryWrapperForImpl(args[i]);
        }
        let callResult = Reflect.construct(value, args);
        callResult = conversions["any"](callResult, { context, globals: globalObject });
        return callResult;
      };
      invokeTheCallbackFunction[utils.wrapperSymbol] = value;
      invokeTheCallbackFunction.objectReference = value;
      return invokeTheCallbackFunction;
    };
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URLSearchParams-impl.js
var require_URLSearchParams_impl = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URLSearchParams-impl.js"(exports) {
    "use strict";
    init_define_process();
    var urlencoded = require_urlencoded();
    exports.implementation = /* @__PURE__ */ __name(class URLSearchParamsImpl {
      constructor(globalObject, constructorArgs, { doNotStripQMark = false }) {
        let init = constructorArgs[0];
        this._list = [];
        this._url = null;
        if (!doNotStripQMark && typeof init === "string" && init[0] === "?") {
          init = init.slice(1);
        }
        if (Array.isArray(init)) {
          for (const pair of init) {
            if (pair.length !== 2) {
              throw new TypeError("Failed to construct 'URLSearchParams': parameter 1 sequence's element does not contain exactly two elements.");
            }
            this._list.push([pair[0], pair[1]]);
          }
        } else if (typeof init === "object" && Object.getPrototypeOf(init) === null) {
          for (const name of Object.keys(init)) {
            const value = init[name];
            this._list.push([name, value]);
          }
        } else {
          this._list = urlencoded.parseUrlencodedString(init);
        }
      }
      _updateSteps() {
        if (this._url !== null) {
          let query = urlencoded.serializeUrlencoded(this._list);
          if (query === "") {
            query = null;
          }
          this._url._url.query = query;
        }
      }
      append(name, value) {
        this._list.push([name, value]);
        this._updateSteps();
      }
      delete(name) {
        let i = 0;
        while (i < this._list.length) {
          if (this._list[i][0] === name) {
            this._list.splice(i, 1);
          } else {
            i++;
          }
        }
        this._updateSteps();
      }
      get(name) {
        for (const tuple of this._list) {
          if (tuple[0] === name) {
            return tuple[1];
          }
        }
        return null;
      }
      getAll(name) {
        const output = [];
        for (const tuple of this._list) {
          if (tuple[0] === name) {
            output.push(tuple[1]);
          }
        }
        return output;
      }
      has(name) {
        for (const tuple of this._list) {
          if (tuple[0] === name) {
            return true;
          }
        }
        return false;
      }
      set(name, value) {
        let found = false;
        let i = 0;
        while (i < this._list.length) {
          if (this._list[i][0] === name) {
            if (found) {
              this._list.splice(i, 1);
            } else {
              found = true;
              this._list[i][1] = value;
              i++;
            }
          } else {
            i++;
          }
        }
        if (!found) {
          this._list.push([name, value]);
        }
        this._updateSteps();
      }
      sort() {
        this._list.sort((a, b) => {
          if (a[0] < b[0]) {
            return -1;
          }
          if (a[0] > b[0]) {
            return 1;
          }
          return 0;
        });
        this._updateSteps();
      }
      [Symbol.iterator]() {
        return this._list[Symbol.iterator]();
      }
      toString() {
        return urlencoded.serializeUrlencoded(this._list);
      }
    }, "URLSearchParamsImpl");
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URLSearchParams.js
var require_URLSearchParams = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URLSearchParams.js"(exports) {
    "use strict";
    init_define_process();
    var conversions = require_lib();
    var utils = require_utils();
    var Function2 = require_Function();
    var newObjectInRealm = utils.newObjectInRealm;
    var implSymbol = utils.implSymbol;
    var ctorRegistrySymbol = utils.ctorRegistrySymbol;
    var interfaceName = "URLSearchParams";
    exports.is = (value) => {
      return utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation;
    };
    exports.isImpl = (value) => {
      return utils.isObject(value) && value instanceof Impl.implementation;
    };
    exports.convert = (globalObject, value, { context = "The provided value" } = {}) => {
      if (exports.is(value)) {
        return utils.implForWrapper(value);
      }
      throw new globalObject.TypeError(`${context} is not of type 'URLSearchParams'.`);
    };
    exports.createDefaultIterator = (globalObject, target, kind) => {
      const ctorRegistry = globalObject[ctorRegistrySymbol];
      const iteratorPrototype = ctorRegistry["URLSearchParams Iterator"];
      const iterator = Object.create(iteratorPrototype);
      Object.defineProperty(iterator, utils.iterInternalSymbol, {
        value: { target, kind, index: 0 },
        configurable: true
      });
      return iterator;
    };
    function makeWrapper(globalObject, newTarget) {
      let proto;
      if (newTarget !== void 0) {
        proto = newTarget.prototype;
      }
      if (!utils.isObject(proto)) {
        proto = globalObject[ctorRegistrySymbol]["URLSearchParams"].prototype;
      }
      return Object.create(proto);
    }
    __name(makeWrapper, "makeWrapper");
    exports.create = (globalObject, constructorArgs, privateData) => {
      const wrapper = makeWrapper(globalObject);
      return exports.setup(wrapper, globalObject, constructorArgs, privateData);
    };
    exports.createImpl = (globalObject, constructorArgs, privateData) => {
      const wrapper = exports.create(globalObject, constructorArgs, privateData);
      return utils.implForWrapper(wrapper);
    };
    exports._internalSetup = (wrapper, globalObject) => {
    };
    exports.setup = (wrapper, globalObject, constructorArgs = [], privateData = {}) => {
      privateData.wrapper = wrapper;
      exports._internalSetup(wrapper, globalObject);
      Object.defineProperty(wrapper, implSymbol, {
        value: new Impl.implementation(globalObject, constructorArgs, privateData),
        configurable: true
      });
      wrapper[implSymbol][utils.wrapperSymbol] = wrapper;
      if (Impl.init) {
        Impl.init(wrapper[implSymbol]);
      }
      return wrapper;
    };
    exports.new = (globalObject, newTarget) => {
      const wrapper = makeWrapper(globalObject, newTarget);
      exports._internalSetup(wrapper, globalObject);
      Object.defineProperty(wrapper, implSymbol, {
        value: Object.create(Impl.implementation.prototype),
        configurable: true
      });
      wrapper[implSymbol][utils.wrapperSymbol] = wrapper;
      if (Impl.init) {
        Impl.init(wrapper[implSymbol]);
      }
      return wrapper[implSymbol];
    };
    var exposed = /* @__PURE__ */ new Set(["Window", "Worker"]);
    exports.install = (globalObject, globalNames) => {
      if (!globalNames.some((globalName) => exposed.has(globalName))) {
        return;
      }
      const ctorRegistry = utils.initCtorRegistry(globalObject);
      class URLSearchParams2 {
        constructor() {
          const args = [];
          {
            let curArg = arguments[0];
            if (curArg !== void 0) {
              if (utils.isObject(curArg)) {
                if (curArg[Symbol.iterator] !== void 0) {
                  if (!utils.isObject(curArg)) {
                    throw new globalObject.TypeError("Failed to construct 'URLSearchParams': parameter 1 sequence is not an iterable object.");
                  } else {
                    const V = [];
                    const tmp = curArg;
                    for (let nextItem of tmp) {
                      if (!utils.isObject(nextItem)) {
                        throw new globalObject.TypeError("Failed to construct 'URLSearchParams': parameter 1 sequence's element is not an iterable object.");
                      } else {
                        const V2 = [];
                        const tmp2 = nextItem;
                        for (let nextItem2 of tmp2) {
                          nextItem2 = conversions["USVString"](nextItem2, {
                            context: "Failed to construct 'URLSearchParams': parameter 1 sequence's element's element",
                            globals: globalObject
                          });
                          V2.push(nextItem2);
                        }
                        nextItem = V2;
                      }
                      V.push(nextItem);
                    }
                    curArg = V;
                  }
                } else {
                  if (!utils.isObject(curArg)) {
                    throw new globalObject.TypeError("Failed to construct 'URLSearchParams': parameter 1 record is not an object.");
                  } else {
                    const result = /* @__PURE__ */ Object.create(null);
                    for (const key of Reflect.ownKeys(curArg)) {
                      const desc = Object.getOwnPropertyDescriptor(curArg, key);
                      if (desc && desc.enumerable) {
                        let typedKey = key;
                        typedKey = conversions["USVString"](typedKey, {
                          context: "Failed to construct 'URLSearchParams': parameter 1 record's key",
                          globals: globalObject
                        });
                        let typedValue = curArg[key];
                        typedValue = conversions["USVString"](typedValue, {
                          context: "Failed to construct 'URLSearchParams': parameter 1 record's value",
                          globals: globalObject
                        });
                        result[typedKey] = typedValue;
                      }
                    }
                    curArg = result;
                  }
                }
              } else {
                curArg = conversions["USVString"](curArg, {
                  context: "Failed to construct 'URLSearchParams': parameter 1",
                  globals: globalObject
                });
              }
            } else {
              curArg = "";
            }
            args.push(curArg);
          }
          return exports.setup(Object.create(new.target.prototype), globalObject, args);
        }
        append(name, value) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'append' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 2) {
            throw new globalObject.TypeError(`Failed to execute 'append' on 'URLSearchParams': 2 arguments required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'append' on 'URLSearchParams': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          {
            let curArg = arguments[1];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'append' on 'URLSearchParams': parameter 2",
              globals: globalObject
            });
            args.push(curArg);
          }
          return utils.tryWrapperForImpl(esValue[implSymbol].append(...args));
        }
        delete(name) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'delete' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 1) {
            throw new globalObject.TypeError(`Failed to execute 'delete' on 'URLSearchParams': 1 argument required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'delete' on 'URLSearchParams': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          return utils.tryWrapperForImpl(esValue[implSymbol].delete(...args));
        }
        get(name) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 1) {
            throw new globalObject.TypeError(`Failed to execute 'get' on 'URLSearchParams': 1 argument required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'get' on 'URLSearchParams': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          return esValue[implSymbol].get(...args);
        }
        getAll(name) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'getAll' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 1) {
            throw new globalObject.TypeError(`Failed to execute 'getAll' on 'URLSearchParams': 1 argument required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'getAll' on 'URLSearchParams': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          return utils.tryWrapperForImpl(esValue[implSymbol].getAll(...args));
        }
        has(name) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'has' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 1) {
            throw new globalObject.TypeError(`Failed to execute 'has' on 'URLSearchParams': 1 argument required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'has' on 'URLSearchParams': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          return esValue[implSymbol].has(...args);
        }
        set(name, value) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 2) {
            throw new globalObject.TypeError(`Failed to execute 'set' on 'URLSearchParams': 2 arguments required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'set' on 'URLSearchParams': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          {
            let curArg = arguments[1];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to execute 'set' on 'URLSearchParams': parameter 2",
              globals: globalObject
            });
            args.push(curArg);
          }
          return utils.tryWrapperForImpl(esValue[implSymbol].set(...args));
        }
        sort() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'sort' called on an object that is not a valid instance of URLSearchParams.");
          }
          return utils.tryWrapperForImpl(esValue[implSymbol].sort());
        }
        toString() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'toString' called on an object that is not a valid instance of URLSearchParams.");
          }
          return esValue[implSymbol].toString();
        }
        keys() {
          if (!exports.is(this)) {
            throw new globalObject.TypeError("'keys' called on an object that is not a valid instance of URLSearchParams.");
          }
          return exports.createDefaultIterator(globalObject, this, "key");
        }
        values() {
          if (!exports.is(this)) {
            throw new globalObject.TypeError("'values' called on an object that is not a valid instance of URLSearchParams.");
          }
          return exports.createDefaultIterator(globalObject, this, "value");
        }
        entries() {
          if (!exports.is(this)) {
            throw new globalObject.TypeError("'entries' called on an object that is not a valid instance of URLSearchParams.");
          }
          return exports.createDefaultIterator(globalObject, this, "key+value");
        }
        forEach(callback) {
          if (!exports.is(this)) {
            throw new globalObject.TypeError("'forEach' called on an object that is not a valid instance of URLSearchParams.");
          }
          if (arguments.length < 1) {
            throw new globalObject.TypeError("Failed to execute 'forEach' on 'iterable': 1 argument required, but only 0 present.");
          }
          callback = Function2.convert(globalObject, callback, {
            context: "Failed to execute 'forEach' on 'iterable': The callback provided as parameter 1"
          });
          const thisArg = arguments[1];
          let pairs = Array.from(this[implSymbol]);
          let i = 0;
          while (i < pairs.length) {
            const [key, value] = pairs[i].map(utils.tryWrapperForImpl);
            callback.call(thisArg, value, key, this);
            pairs = Array.from(this[implSymbol]);
            i++;
          }
        }
      }
      __name(URLSearchParams2, "URLSearchParams");
      Object.defineProperties(URLSearchParams2.prototype, {
        append: { enumerable: true },
        delete: { enumerable: true },
        get: { enumerable: true },
        getAll: { enumerable: true },
        has: { enumerable: true },
        set: { enumerable: true },
        sort: { enumerable: true },
        toString: { enumerable: true },
        keys: { enumerable: true },
        values: { enumerable: true },
        entries: { enumerable: true },
        forEach: { enumerable: true },
        [Symbol.toStringTag]: { value: "URLSearchParams", configurable: true },
        [Symbol.iterator]: { value: URLSearchParams2.prototype.entries, configurable: true, writable: true }
      });
      ctorRegistry[interfaceName] = URLSearchParams2;
      ctorRegistry["URLSearchParams Iterator"] = Object.create(ctorRegistry["%IteratorPrototype%"], {
        [Symbol.toStringTag]: {
          configurable: true,
          value: "URLSearchParams Iterator"
        }
      });
      utils.define(ctorRegistry["URLSearchParams Iterator"], {
        next() {
          const internal = this && this[utils.iterInternalSymbol];
          if (!internal) {
            throw new globalObject.TypeError("next() called on a value that is not a URLSearchParams iterator object");
          }
          const { target, kind, index } = internal;
          const values = Array.from(target[implSymbol]);
          const len = values.length;
          if (index >= len) {
            return newObjectInRealm(globalObject, { value: void 0, done: true });
          }
          const pair = values[index];
          internal.index = index + 1;
          return newObjectInRealm(globalObject, utils.iteratorResult(pair.map(utils.tryWrapperForImpl), kind));
        }
      });
      Object.defineProperty(globalObject, interfaceName, {
        configurable: true,
        writable: true,
        value: URLSearchParams2
      });
    };
    var Impl = require_URLSearchParams_impl();
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URL-impl.js
var require_URL_impl = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URL-impl.js"(exports) {
    "use strict";
    init_define_process();
    var usm = require_url_state_machine();
    var urlencoded = require_urlencoded();
    var URLSearchParams2 = require_URLSearchParams();
    exports.implementation = /* @__PURE__ */ __name(class URLImpl {
      constructor(globalObject, constructorArgs) {
        const url = constructorArgs[0];
        const base = constructorArgs[1];
        let parsedBase = null;
        if (base !== void 0) {
          parsedBase = usm.basicURLParse(base);
          if (parsedBase === null) {
            throw new TypeError(`Invalid base URL: ${base}`);
          }
        }
        const parsedURL = usm.basicURLParse(url, { baseURL: parsedBase });
        if (parsedURL === null) {
          throw new TypeError(`Invalid URL: ${url}`);
        }
        const query = parsedURL.query !== null ? parsedURL.query : "";
        this._url = parsedURL;
        this._query = URLSearchParams2.createImpl(globalObject, [query], { doNotStripQMark: true });
        this._query._url = this;
      }
      get href() {
        return usm.serializeURL(this._url);
      }
      set href(v) {
        const parsedURL = usm.basicURLParse(v);
        if (parsedURL === null) {
          throw new TypeError(`Invalid URL: ${v}`);
        }
        this._url = parsedURL;
        this._query._list.splice(0);
        const { query } = parsedURL;
        if (query !== null) {
          this._query._list = urlencoded.parseUrlencodedString(query);
        }
      }
      get origin() {
        return usm.serializeURLOrigin(this._url);
      }
      get protocol() {
        return `${this._url.scheme}:`;
      }
      set protocol(v) {
        usm.basicURLParse(`${v}:`, { url: this._url, stateOverride: "scheme start" });
      }
      get username() {
        return this._url.username;
      }
      set username(v) {
        if (usm.cannotHaveAUsernamePasswordPort(this._url)) {
          return;
        }
        usm.setTheUsername(this._url, v);
      }
      get password() {
        return this._url.password;
      }
      set password(v) {
        if (usm.cannotHaveAUsernamePasswordPort(this._url)) {
          return;
        }
        usm.setThePassword(this._url, v);
      }
      get host() {
        const url = this._url;
        if (url.host === null) {
          return "";
        }
        if (url.port === null) {
          return usm.serializeHost(url.host);
        }
        return `${usm.serializeHost(url.host)}:${usm.serializeInteger(url.port)}`;
      }
      set host(v) {
        if (usm.hasAnOpaquePath(this._url)) {
          return;
        }
        usm.basicURLParse(v, { url: this._url, stateOverride: "host" });
      }
      get hostname() {
        if (this._url.host === null) {
          return "";
        }
        return usm.serializeHost(this._url.host);
      }
      set hostname(v) {
        if (usm.hasAnOpaquePath(this._url)) {
          return;
        }
        usm.basicURLParse(v, { url: this._url, stateOverride: "hostname" });
      }
      get port() {
        if (this._url.port === null) {
          return "";
        }
        return usm.serializeInteger(this._url.port);
      }
      set port(v) {
        if (usm.cannotHaveAUsernamePasswordPort(this._url)) {
          return;
        }
        if (v === "") {
          this._url.port = null;
        } else {
          usm.basicURLParse(v, { url: this._url, stateOverride: "port" });
        }
      }
      get pathname() {
        return usm.serializePath(this._url);
      }
      set pathname(v) {
        if (usm.hasAnOpaquePath(this._url)) {
          return;
        }
        this._url.path = [];
        usm.basicURLParse(v, { url: this._url, stateOverride: "path start" });
      }
      get search() {
        if (this._url.query === null || this._url.query === "") {
          return "";
        }
        return `?${this._url.query}`;
      }
      set search(v) {
        const url = this._url;
        if (v === "") {
          url.query = null;
          this._query._list = [];
          return;
        }
        const input = v[0] === "?" ? v.substring(1) : v;
        url.query = "";
        usm.basicURLParse(input, { url, stateOverride: "query" });
        this._query._list = urlencoded.parseUrlencodedString(input);
      }
      get searchParams() {
        return this._query;
      }
      get hash() {
        if (this._url.fragment === null || this._url.fragment === "") {
          return "";
        }
        return `#${this._url.fragment}`;
      }
      set hash(v) {
        if (v === "") {
          this._url.fragment = null;
          return;
        }
        const input = v[0] === "#" ? v.substring(1) : v;
        this._url.fragment = "";
        usm.basicURLParse(input, { url: this._url, stateOverride: "fragment" });
      }
      toJSON() {
        return this.href;
      }
    }, "URLImpl");
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URL.js
var require_URL = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/lib/URL.js"(exports) {
    "use strict";
    init_define_process();
    var conversions = require_lib();
    var utils = require_utils();
    var implSymbol = utils.implSymbol;
    var ctorRegistrySymbol = utils.ctorRegistrySymbol;
    var interfaceName = "URL";
    exports.is = (value) => {
      return utils.isObject(value) && utils.hasOwn(value, implSymbol) && value[implSymbol] instanceof Impl.implementation;
    };
    exports.isImpl = (value) => {
      return utils.isObject(value) && value instanceof Impl.implementation;
    };
    exports.convert = (globalObject, value, { context = "The provided value" } = {}) => {
      if (exports.is(value)) {
        return utils.implForWrapper(value);
      }
      throw new globalObject.TypeError(`${context} is not of type 'URL'.`);
    };
    function makeWrapper(globalObject, newTarget) {
      let proto;
      if (newTarget !== void 0) {
        proto = newTarget.prototype;
      }
      if (!utils.isObject(proto)) {
        proto = globalObject[ctorRegistrySymbol]["URL"].prototype;
      }
      return Object.create(proto);
    }
    __name(makeWrapper, "makeWrapper");
    exports.create = (globalObject, constructorArgs, privateData) => {
      const wrapper = makeWrapper(globalObject);
      return exports.setup(wrapper, globalObject, constructorArgs, privateData);
    };
    exports.createImpl = (globalObject, constructorArgs, privateData) => {
      const wrapper = exports.create(globalObject, constructorArgs, privateData);
      return utils.implForWrapper(wrapper);
    };
    exports._internalSetup = (wrapper, globalObject) => {
    };
    exports.setup = (wrapper, globalObject, constructorArgs = [], privateData = {}) => {
      privateData.wrapper = wrapper;
      exports._internalSetup(wrapper, globalObject);
      Object.defineProperty(wrapper, implSymbol, {
        value: new Impl.implementation(globalObject, constructorArgs, privateData),
        configurable: true
      });
      wrapper[implSymbol][utils.wrapperSymbol] = wrapper;
      if (Impl.init) {
        Impl.init(wrapper[implSymbol]);
      }
      return wrapper;
    };
    exports.new = (globalObject, newTarget) => {
      const wrapper = makeWrapper(globalObject, newTarget);
      exports._internalSetup(wrapper, globalObject);
      Object.defineProperty(wrapper, implSymbol, {
        value: Object.create(Impl.implementation.prototype),
        configurable: true
      });
      wrapper[implSymbol][utils.wrapperSymbol] = wrapper;
      if (Impl.init) {
        Impl.init(wrapper[implSymbol]);
      }
      return wrapper[implSymbol];
    };
    var exposed = /* @__PURE__ */ new Set(["Window", "Worker"]);
    exports.install = (globalObject, globalNames) => {
      if (!globalNames.some((globalName) => exposed.has(globalName))) {
        return;
      }
      const ctorRegistry = utils.initCtorRegistry(globalObject);
      class URL3 {
        constructor(url) {
          if (arguments.length < 1) {
            throw new globalObject.TypeError(`Failed to construct 'URL': 1 argument required, but only ${arguments.length} present.`);
          }
          const args = [];
          {
            let curArg = arguments[0];
            curArg = conversions["USVString"](curArg, {
              context: "Failed to construct 'URL': parameter 1",
              globals: globalObject
            });
            args.push(curArg);
          }
          {
            let curArg = arguments[1];
            if (curArg !== void 0) {
              curArg = conversions["USVString"](curArg, {
                context: "Failed to construct 'URL': parameter 2",
                globals: globalObject
              });
            }
            args.push(curArg);
          }
          return exports.setup(Object.create(new.target.prototype), globalObject, args);
        }
        toJSON() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'toJSON' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol].toJSON();
        }
        get href() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get href' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["href"];
        }
        set href(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set href' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'href' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["href"] = V;
        }
        toString() {
          const esValue = this;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'toString' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["href"];
        }
        get origin() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get origin' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["origin"];
        }
        get protocol() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get protocol' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["protocol"];
        }
        set protocol(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set protocol' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'protocol' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["protocol"] = V;
        }
        get username() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get username' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["username"];
        }
        set username(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set username' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'username' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["username"] = V;
        }
        get password() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get password' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["password"];
        }
        set password(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set password' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'password' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["password"] = V;
        }
        get host() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get host' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["host"];
        }
        set host(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set host' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'host' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["host"] = V;
        }
        get hostname() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get hostname' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["hostname"];
        }
        set hostname(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set hostname' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'hostname' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["hostname"] = V;
        }
        get port() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get port' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["port"];
        }
        set port(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set port' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'port' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["port"] = V;
        }
        get pathname() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get pathname' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["pathname"];
        }
        set pathname(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set pathname' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'pathname' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["pathname"] = V;
        }
        get search() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get search' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["search"];
        }
        set search(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set search' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'search' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["search"] = V;
        }
        get searchParams() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get searchParams' called on an object that is not a valid instance of URL.");
          }
          return utils.getSameObject(this, "searchParams", () => {
            return utils.tryWrapperForImpl(esValue[implSymbol]["searchParams"]);
          });
        }
        get hash() {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'get hash' called on an object that is not a valid instance of URL.");
          }
          return esValue[implSymbol]["hash"];
        }
        set hash(V) {
          const esValue = this !== null && this !== void 0 ? this : globalObject;
          if (!exports.is(esValue)) {
            throw new globalObject.TypeError("'set hash' called on an object that is not a valid instance of URL.");
          }
          V = conversions["USVString"](V, {
            context: "Failed to set the 'hash' property on 'URL': The provided value",
            globals: globalObject
          });
          esValue[implSymbol]["hash"] = V;
        }
      }
      __name(URL3, "URL");
      Object.defineProperties(URL3.prototype, {
        toJSON: { enumerable: true },
        href: { enumerable: true },
        toString: { enumerable: true },
        origin: { enumerable: true },
        protocol: { enumerable: true },
        username: { enumerable: true },
        password: { enumerable: true },
        host: { enumerable: true },
        hostname: { enumerable: true },
        port: { enumerable: true },
        pathname: { enumerable: true },
        search: { enumerable: true },
        searchParams: { enumerable: true },
        hash: { enumerable: true },
        [Symbol.toStringTag]: { value: "URL", configurable: true }
      });
      ctorRegistry[interfaceName] = URL3;
      Object.defineProperty(globalObject, interfaceName, {
        configurable: true,
        writable: true,
        value: URL3
      });
      if (globalNames.includes("Window")) {
        Object.defineProperty(globalObject, "webkitURL", {
          configurable: true,
          writable: true,
          value: URL3
        });
      }
    };
    var Impl = require_URL_impl();
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/webidl2js-wrapper.js
var require_webidl2js_wrapper = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/webidl2js-wrapper.js"(exports) {
    "use strict";
    init_define_process();
    var URL3 = require_URL();
    var URLSearchParams2 = require_URLSearchParams();
    exports.URL = URL3;
    exports.URLSearchParams = URLSearchParams2;
  }
});

// ../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/index.js
var require_whatwg_url = __commonJS({
  "../../node_modules/.pnpm/whatwg-url@11.0.0/node_modules/whatwg-url/index.js"(exports) {
    "use strict";
    init_define_process();
    var { URL: URL3, URLSearchParams: URLSearchParams2 } = require_webidl2js_wrapper();
    var urlStateMachine = require_url_state_machine();
    var percentEncoding = require_percent_encoding();
    var sharedGlobalObject = { Array, Object, Promise, String, TypeError };
    URL3.install(sharedGlobalObject, ["Window"]);
    URLSearchParams2.install(sharedGlobalObject, ["Window"]);
    exports.URL = sharedGlobalObject.URL;
    exports.URLSearchParams = sharedGlobalObject.URLSearchParams;
    exports.parseURL = urlStateMachine.parseURL;
    exports.basicURLParse = urlStateMachine.basicURLParse;
    exports.serializeURL = urlStateMachine.serializeURL;
    exports.serializePath = urlStateMachine.serializePath;
    exports.serializeHost = urlStateMachine.serializeHost;
    exports.serializeInteger = urlStateMachine.serializeInteger;
    exports.serializeURLOrigin = urlStateMachine.serializeURLOrigin;
    exports.setTheUsername = urlStateMachine.setTheUsername;
    exports.setThePassword = urlStateMachine.setThePassword;
    exports.cannotHaveAUsernamePasswordPort = urlStateMachine.cannotHaveAUsernamePasswordPort;
    exports.hasAnOpaquePath = urlStateMachine.hasAnOpaquePath;
    exports.percentDecodeString = percentEncoding.percentDecodeString;
    exports.percentDecodeBytes = percentEncoding.percentDecodeBytes;
  }
});

// src/primitives/url.js
var url_exports = {};
__export(url_exports, {
  URL: () => import_whatwg_url.URL,
  URLPattern: () => URLPattern,
  URLSearchParams: () => import_whatwg_url.URLSearchParams
});
module.exports = __toCommonJS(url_exports);
init_define_process();
var import_whatwg_url = __toESM(require_whatwg_url());

// ../../node_modules/.pnpm/urlpattern-polyfill@5.0.5/node_modules/urlpattern-polyfill/index.js
init_define_process();

// ../../node_modules/.pnpm/urlpattern-polyfill@5.0.5/node_modules/urlpattern-polyfill/dist/urlpattern.js
init_define_process();
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
  var _a;
  const tokens = lexer(str);
  const { prefixes = "./" } = options;
  const defaultPattern = `[^${escapeString((_a = options.delimiter) != null ? _a : "/#?")}]+?`;
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
  var _a, _b;
  const {
    strict = false,
    start = true,
    end = true,
    encode = /* @__PURE__ */ __name((x) => x, "encode")
  } = options;
  const endsWith = `[${escapeString((_a = options.endsWith) != null ? _a : "")}]|$`;
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
  var _a;
  const wildcardPattern = ".*";
  const segmentWildcardPattern = `[^${escapeRegexpString((_a = options.delimiter) != null ? _a : "/#?")}]+?`;
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

// ../../node_modules/.pnpm/urlpattern-polyfill@5.0.5/node_modules/urlpattern-polyfill/index.js
if (!globalThis.URLPattern) {
  globalThis.URLPattern = URLPattern;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  URL,
  URLPattern,
  URLSearchParams
});
