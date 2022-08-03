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

// ../format/dist/index.js
var require_dist = __commonJS({
  "../format/dist/index.js"(exports) {
    "use strict";
    init_define_process();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createFormat = void 0;
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
            return format2(firstArg[customInspectSymbol]());
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
              return hasCustomSymbol(arg, customInspectSymbol) ? format2(arg[customInspectSymbol]()) : String(arg);
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
      __name(format2, "format");
      function formatValue(ctx, value, recurseTimes) {
        if (hasCustomSymbol(value, customInspectSymbol)) {
          return format2(value[customInspectSymbol]());
        }
        const formattedPrimitive = formatPrimitive(value);
        if (formattedPrimitive !== void 0) {
          return formattedPrimitive;
        }
        const symbols = Object.getOwnPropertySymbols(value);
        if (symbols.length > 0) {
          symbols.forEach((symbol) => {
            const obj = value;
            const symbolKey = `[${symbol.toString()}]`;
            obj[symbolKey] = obj[symbol];
            delete obj[symbol];
          });
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
            return format2(value[ctx.customInspectSymbol]());
          }
        }
        const isValueFunction = kind(value, "function");
        const isValueArray = Array.isArray(value);
        let base = "";
        if (isValueFunction) {
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
        const braces = isValueArray ? ["[", "]"] : isValueFunction ? ["", ""] : ["{", "}"];
        if (keys.length === 0 && (!isValueArray || value.length === 0)) {
          return braces[0] + base + braces[1];
        }
        if (recurseTimes && recurseTimes < 0) {
          return isRegExp(value) ? RegExp.prototype.toString.call(value) : "[Object]";
        }
        ctx.seen.push(value);
        let output = isValueArray ? formatArray(ctx, value, recurseTimes, visibleKeys, keys) : keys.map((key) => formatProperty(ctx, value, recurseTimes, visibleKeys, key, false));
        ctx.seen.pop();
        return reduceToSingleString(output, base, braces, isValueFunction);
      }
      __name(formatValue, "formatValue");
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
              if (isArray) {
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
          if (isArray && key.match(/^\d+$/)) {
            return str;
          }
        }
        return `${key}: ${str}`;
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
      return format2;
    }
    __name(createFormat2, "createFormat");
    exports.createFormat = createFormat2;
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
    function reduceToSingleString(output, base, braces, isValueFunction) {
      const length = output.reduce((prev, cur) => {
        return prev + cur.replace(/\u001b\[\d\d?m/g, "").length + 1;
      }, 0);
      if (length > 60) {
        const prefix2 = isValueFunction ? " {" : "";
        const suffix2 = isValueFunction ? "\n}" : " ";
        return braces[0] + (base === "" ? "" : base + prefix2 + "\n ") + ` ${output.join(",\n  ")}` + suffix2 + braces[1];
      }
      const prefix = isValueFunction ? " { " : " ";
      const suffix = isValueFunction ? " } " : " ";
      return (braces[0] + base + prefix + output.join(", ") + suffix + braces[1]).trim();
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
