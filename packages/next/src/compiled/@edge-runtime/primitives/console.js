"use strict";
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// <define:process>
var init_define_process = __esm({
  "<define:process>"() {
  }
});

// ../format/dist/index.js
var require_dist = __commonJS({
  "../format/dist/index.js"(exports, module2) {
    "use strict";
    init_define_process();
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
    var src_exports = {};
    __export2(src_exports, {
      createFormat: () => createFormat2
    });
    module2.exports = __toCommonJS2(src_exports);
    var ReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
    function GetOwnGetter(target, key) {
      const descriptor = ReflectGetOwnPropertyDescriptor(target, key);
      return descriptor ? descriptor.get : void 0;
    }
    __name(GetOwnGetter, "GetOwnGetter");
    var ReflectGetPrototypeOf = Reflect.getPrototypeOf;
    var TypedArray = ReflectGetPrototypeOf(Uint8Array);
    var ArrayPrototypeFilter = Array.prototype.filter;
    var ArrayPrototypePush = Array.prototype.push;
    var DatePrototypeGetTime = Date.prototype.getTime;
    var DatePrototypeToISOString = Date.prototype.toISOString;
    var ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
    var ObjectGetOwnPropertyNames = Object.getOwnPropertyNames;
    var ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
    var ObjectKeys = Object.keys;
    var ObjectPrototypePropertyIsEnumerable = Object.prototype.propertyIsEnumerable;
    var ObjectPrototypeToString = Object.prototype.toString;
    var MapPrototypeGetSize = GetOwnGetter(Map.prototype, "size");
    var SetPrototypeGetSize = GetOwnGetter(Set.prototype, "size");
    var StringPrototypeIncludes = String.prototype.includes;
    var SymbolIterator = Symbol.iterator;
    var SymbolPrototypeToString = Symbol.prototype.toString;
    var TypedArrayPrototypeGetLength = GetOwnGetter(
      TypedArray.prototype,
      "length"
    );
    var typedArrayStrings = /* @__PURE__ */ new Set([
      "[object BigInt64Array]",
      "[object BigUint64Array]",
      "[object Float32Array]",
      "[object Float64Array]",
      "[object Int8Array]",
      "[object Int16Array]",
      "[object Int32Array]",
      "[object Uint8Array]",
      "[object Uint8ClampedArray]",
      "[object Uint16Array]",
      "[object Uint32Array]"
    ]);
    function getOwnNonIndexProperties(object, filter) {
      const indexes = Array.isArray(object) || isTypedArray(object) ? new Set([...object.keys()].map((v) => v.toString())) : void 0;
      return Object.entries(ObjectGetOwnPropertyDescriptors(object)).filter(([key, desc]) => {
        if (indexes && indexes.has(key)) {
          return false;
        }
        if (filter === 1 && !desc.enumerable) {
          return false;
        }
        return true;
      }).map(([key]) => key);
    }
    __name(getOwnNonIndexProperties, "getOwnNonIndexProperties");
    var isTypedArray = /* @__PURE__ */ __name((value) => kind(value, "object") && typedArrayStrings.has(ObjectPrototypeToString.call(value)), "isTypedArray");
    function kind(value, type) {
      return typeof value === type;
    }
    __name(kind, "kind");
    var getConstructorName = /* @__PURE__ */ __name((object) => {
      var _a;
      return (_a = object.constructor) == null ? void 0 : _a.name;
    }, "getConstructorName");
    var getPrefix = /* @__PURE__ */ __name((constructor = "", size = "") => `${constructor}${size} `, "getPrefix");
    function createFormat2(opts = {}) {
      if (opts.customInspectSymbol === void 0) {
        opts.customInspectSymbol = Symbol.for("edge-runtime.inspect.custom");
      }
      if (opts.formatError === void 0) {
        opts.formatError = (error2) => `[${Error.prototype.toString.call(error2)}]`;
      }
      const { formatError, customInspectSymbol } = opts;
      function format2(...args) {
        const [firstArg] = args;
        if (!kind(firstArg, "string")) {
          if (hasCustomSymbol(firstArg, customInspectSymbol)) {
            return format2(firstArg[customInspectSymbol]({ format: format2 }));
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
              if (hasCustomSymbol(arg, customInspectSymbol)) {
                return format2(arg[customInspectSymbol]({ format: format2 }));
              } else if (isDate(arg) || isError(arg) || kind(arg, "bigint")) {
                return format2(arg);
              } else {
                return String(arg);
              }
            }
            case "%j":
              return safeStringify(args[index++]);
            case "%d": {
              const arg = args[index++];
              if (kind(arg, "bigint")) {
                return format2(arg);
              } else {
                return String(Number(arg));
              }
            }
            case "%O":
              return inspect(args[index++], { customInspectSymbol });
            case "%o":
              return inspect(args[index++], {
                customInspectSymbol,
                showHidden: true,
                depth: 4
              });
            case "%i": {
              const arg = args[index++];
              if (kind(arg, "bigint")) {
                return format2(arg);
              } else {
                return String(parseInt(arg, 10));
              }
            }
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
      __name(format2, "format");
      function formatValue(ctx, value, recurseTimes) {
        if (hasCustomSymbol(value, customInspectSymbol)) {
          return format2(value[customInspectSymbol]({ format: format2 }));
        }
        const formattedPrimitive = formatPrimitive(value);
        if (formattedPrimitive !== void 0) {
          return formattedPrimitive;
        }
        if (ctx.seen.includes(value)) {
          let index = 1;
          if (ctx.circular === void 0) {
            ctx.circular = /* @__PURE__ */ new Map();
            ctx.circular.set(value, index);
          } else {
            index = ctx.circular.get(value);
            if (index === void 0) {
              index = ctx.circular.size + 1;
              ctx.circular.set(value, index);
            }
          }
          return `[Circular *${index}]`;
        }
        return formatRaw(ctx, value, recurseTimes);
      }
      __name(formatValue, "formatValue");
      function formatRaw(ctx, value, recurseTimes) {
        let keys = [];
        const constructor = getConstructorName(value);
        let base = "";
        let formatter = /* @__PURE__ */ __name(() => [], "formatter");
        let braces = ["", ""];
        let noIterator = true;
        const filter = ctx.showHidden ? 0 : 1;
        if (SymbolIterator in value) {
          noIterator = false;
          if (Array.isArray(value)) {
            const prefix = constructor !== "Array" ? getPrefix(constructor, `(${value.length})`) : "";
            keys = getOwnNonIndexProperties(value, filter);
            braces = [`${prefix}[`, "]"];
            if (value.length === 0 && keys.length === 0) {
              return `${braces[0]}]`;
            }
            formatter = formatArray;
          } else if (isSet(value)) {
            const size = SetPrototypeGetSize.call(value);
            const prefix = getPrefix(constructor, `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            formatter = formatSet;
            if (size === 0 && keys.length === 0) {
              return `${prefix}{}`;
            }
            braces = [`${prefix}{`, "}"];
          } else if (isMap(value)) {
            const size = MapPrototypeGetSize.call(value);
            const prefix = getPrefix(constructor, `(${size})`);
            keys = getKeys(value, ctx.showHidden);
            formatter = formatMap;
            if (size === 0 && keys.length === 0) {
              return `${prefix}{}`;
            }
            braces = [`${prefix}{`, "}"];
          } else if (isTypedArray(value)) {
            keys = getOwnNonIndexProperties(value, filter);
            const size = TypedArrayPrototypeGetLength.call(value);
            const prefix = getPrefix(constructor, `(${size})`);
            braces = [`${prefix}[`, "]"];
            if (value.length === 0 && keys.length === 0)
              return `${braces[0]}]`;
            formatter = formatTypedArray.bind(null, size);
          } else {
            noIterator = true;
          }
        }
        if (noIterator) {
          keys = getKeys(value, ctx.showHidden);
          braces = ["{", "}"];
          if (constructor === void 0) {
            if (keys.length === 0) {
              return `[Object: null prototype] {}`;
            }
          } else if (constructor === "Object") {
            if (keys.length === 0) {
              return `{}`;
            }
          } else if (kind(value, "function")) {
            base = `[Function${value.name ? ": " + value.name : ""}]`;
            if (keys.length === 0) {
              return base;
            }
          } else if (isRegExp(value)) {
            base = RegExp.prototype.toString.call(value);
            if (keys.length === 0) {
              return base;
            }
            base = " " + base;
          } else if (isDate(value)) {
            base = Number.isNaN(DatePrototypeGetTime.call(value)) ? Date.prototype.toString.call(value) : DatePrototypeToISOString.call(value);
            if (keys.length === 0) {
              return base;
            }
            base = " " + base;
          } else if (isError(value)) {
            base = formatError(value);
            if (keys.length === 0) {
              return base;
            }
            base = " " + base;
          } else if (hasCustomSymbol(value, ctx.customInspectSymbol)) {
            base = format2(value[ctx.customInspectSymbol]({ format: format2 }));
            if (keys.length === 0) {
              return base;
            }
            base = " " + base;
          } else {
            braces[0] = `${getPrefix(constructor)}{`;
          }
        }
        if (recurseTimes && recurseTimes < 0) {
          return isRegExp(value) ? RegExp.prototype.toString.call(value) : "[Object]";
        }
        ctx.seen.push(value);
        const visibleKeys = new Set(keys);
        const output = formatter(ctx, value, recurseTimes, visibleKeys, keys);
        for (let i = 0; i < keys.length; i++) {
          output.push(
            formatProperty(
              ctx,
              value,
              recurseTimes,
              visibleKeys,
              keys[i],
              false
            )
          );
        }
        if (ctx.circular !== void 0) {
          const index = ctx.circular.get(value);
          if (index !== void 0) {
            const reference = `<ref *${index}>`;
            base = base === "" ? reference : `${reference} ${base}`;
          }
        }
        ctx.seen.pop();
        return reduceToSingleString(output, base, braces);
      }
      __name(formatRaw, "formatRaw");
      function inspect(value, opts2) {
        opts2 = Object.assign({ seen: [], depth: 2 }, opts2);
        return formatValue(opts2, value, opts2.depth);
      }
      __name(inspect, "inspect");
      function formatProperty(ctx, value, recurseTimes, visibleKeys, key, isArray) {
        let name;
        let str;
        const desc = Object.getOwnPropertyDescriptor(value, key) || {
          value: value[key]
        };
        if (desc.value !== void 0) {
          str = formatValue(ctx, desc.value, recurseTimes);
        } else if (desc.get) {
          str = desc.set ? "[Getter/Setter]" : "[Getter]";
        } else if (desc.set) {
          str = "[Setter]";
        } else {
          str = "undefined";
        }
        if (isArray) {
          return str;
        }
        if (kind(key, "symbol")) {
          name = `[${SymbolPrototypeToString.call(key)}]`;
        } else if (!visibleKeys.has(key)) {
          name = "[" + key + "]";
        } else {
          name = key;
        }
        return `${name}: ${str}`;
      }
      __name(formatProperty, "formatProperty");
      function formatArray(ctx, value, recurseTimes, visibleKeys) {
        const output = [];
        for (let index = 0; index < value.length; ++index) {
          if (Object.prototype.hasOwnProperty.call(value, String(index))) {
            output.push(
              formatProperty(
                ctx,
                value,
                recurseTimes,
                visibleKeys,
                String(index),
                true
              )
            );
          } else {
            output.push("");
          }
        }
        return output;
      }
      __name(formatArray, "formatArray");
      function formatTypedArray(length, ctx, value, recurseTimes) {
        const output = new Array(length);
        for (let i = 0; i < length; ++i) {
          output[i] = value.length > 0 && kind(value[0], "number") ? String(value[i]) : formatBigInt(value[i]);
        }
        if (ctx.showHidden) {
          for (const key of [
            "BYTES_PER_ELEMENT",
            "length",
            "byteLength",
            "byteOffset",
            "buffer"
          ]) {
            const str = formatValue(ctx, value[key], recurseTimes);
            ArrayPrototypePush.call(output, `[${String(key)}]: ${str}`);
          }
        }
        return output;
      }
      __name(formatTypedArray, "formatTypedArray");
      function formatSet(ctx, value, recurseTimes) {
        const output = [];
        for (const v of value) {
          ArrayPrototypePush.call(output, formatValue(ctx, v, recurseTimes));
        }
        return output;
      }
      __name(formatSet, "formatSet");
      function formatMap(ctx, value, recurseTimes) {
        const output = [];
        for (const { 0: k, 1: v } of value) {
          output.push(
            `${formatValue(ctx, k, recurseTimes)} => ${formatValue(
              ctx,
              v,
              recurseTimes
            )}`
          );
        }
        return output;
      }
      __name(formatMap, "formatMap");
      return format2;
    }
    __name(createFormat2, "createFormat");
    var formatBigInt = /* @__PURE__ */ __name((bigint) => `${bigint}n`, "formatBigInt");
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
        return formatBigInt(value);
      if (kind(value, "symbol"))
        return value.toString();
    }
    __name(formatPrimitive, "formatPrimitive");
    function hasCustomSymbol(value, customInspectSymbol) {
      return value !== null && kind(value, "object") && customInspectSymbol in value && kind(value[customInspectSymbol], "function");
    }
    __name(hasCustomSymbol, "hasCustomSymbol");
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
    function isMap(value) {
      return kind(value, "object") && Object.prototype.toString.call(value) === "[object Map]";
    }
    __name(isMap, "isMap");
    function isSet(value) {
      return kind(value, "object") && Object.prototype.toString.call(value) === "[object Set]";
    }
    __name(isSet, "isSet");
    function isBelowBreakLength(output, start, base) {
      const breakLength = 80;
      let totalLength = output.length + start;
      if (totalLength + output.length > breakLength) {
        return false;
      }
      for (let i = 0; i < output.length; i++) {
        totalLength += output[i].length;
        if (totalLength > breakLength) {
          return false;
        }
      }
      return base === "" || !StringPrototypeIncludes.call(base, "\n");
    }
    __name(isBelowBreakLength, "isBelowBreakLength");
    function reduceToSingleString(output, base, braces) {
      const start = output.length + braces[0].length + base.length + 10;
      if (!isBelowBreakLength(output, start, base)) {
        return (base ? base + " " : "") + braces[0] + "\n  " + output.join(",\n  ") + "\n" + braces[1];
      }
      return ((base ? base + " " : "") + braces[0] + " " + output.join(", ") + " " + braces[1]).trim();
    }
    __name(reduceToSingleString, "reduceToSingleString");
    function safeStringify(input) {
      if (Array.isArray(input)) {
        input = input.map(
          (element) => JSON.parse(JSON.stringify(element, makeCircularReplacer()))
        );
      }
      return JSON.stringify(input, makeCircularReplacer());
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
    function getKeys(value, showHidden = false) {
      let keys;
      const symbols = ObjectGetOwnPropertySymbols(value);
      if (showHidden) {
        keys = ObjectGetOwnPropertyNames(value);
        if (symbols.length !== 0)
          ArrayPrototypePush.apply(keys, symbols);
      } else {
        try {
          keys = ObjectKeys(value);
        } catch (err) {
          keys = ObjectGetOwnPropertyNames(value);
        }
        if (symbols.length !== 0) {
          const filter = /* @__PURE__ */ __name((key) => ObjectPrototypePropertyIsEnumerable.call(value, key), "filter");
          ArrayPrototypePush.apply(keys, ArrayPrototypeFilter.call(symbols, filter));
        }
      }
      return keys;
    }
    __name(getKeys, "getKeys");
  }
});

// src/primitives/console.js
var console_exports = {};
__export(console_exports, {
  console: () => konsole
});
module.exports = __toCommonJS(console_exports);
init_define_process();
var import_format = __toESM(require_dist());
var format = (0, import_format.createFormat)();
var bareError = console.error.bind(console);
var bareLog = console.log.bind(console);
var assert = console.assert.bind(console);
var time = console.time.bind(console);
var timeEnd = console.timeEnd.bind(console);
var timeLog = console.timeLog.bind(console);
var trace = console.trace.bind(console);
var error = /* @__PURE__ */ __name((...args) => bareError(format(...args)), "error");
var log = /* @__PURE__ */ __name((...args) => bareLog(format(...args)), "log");
var konsole = {
  assert: (assertion, ...args) => assert(assertion, format(...args)),
  count: console.count.bind(console),
  debug: log,
  dir: console.dir.bind(console),
  error,
  info: log,
  log,
  time: (...args) => time(format(...args)),
  timeEnd: (...args) => timeEnd(format(...args)),
  timeLog,
  trace,
  warn: error
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  console
});
