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
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};

// <define:process>
var init_define_process = __esm({
  "<define:process>"() {
  }
});

// ../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/tslib.js
var require_tslib = __commonJS({
  "../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/tslib.js"(exports, module2) {
    init_define_process();
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

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/rng.js
var require_rng = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/rng.js"(exports) {
    "use strict";
    init_define_process();
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
    init_define_process();
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
    init_define_process();
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _regex = _interopRequireDefault(require_regex());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function validate2(uuid2) {
      return typeof uuid2 === "string" && _regex.default.test(uuid2);
    }
    __name(validate2, "validate");
    var _default = validate2;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/stringify.js
var require_stringify = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/stringify.js"(exports) {
    "use strict";
    init_define_process();
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
    function stringify2(arr, offset = 0) {
      const uuid2 = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
      if (!(0, _validate.default)(uuid2)) {
        throw TypeError("Stringified UUID is invalid");
      }
      return uuid2;
    }
    __name(stringify2, "stringify");
    var _default = stringify2;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v1.js
var require_v1 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v1.js"(exports) {
    "use strict";
    init_define_process();
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
    function v12(options, buf, offset) {
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
    __name(v12, "v1");
    var _default = v12;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/parse.js
var require_parse = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/parse.js"(exports) {
    "use strict";
    init_define_process();
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function parse2(uuid2) {
      if (!(0, _validate.default)(uuid2)) {
        throw TypeError("Invalid UUID");
      }
      let v;
      const arr = new Uint8Array(16);
      arr[0] = (v = parseInt(uuid2.slice(0, 8), 16)) >>> 24;
      arr[1] = v >>> 16 & 255;
      arr[2] = v >>> 8 & 255;
      arr[3] = v & 255;
      arr[4] = (v = parseInt(uuid2.slice(9, 13), 16)) >>> 8;
      arr[5] = v & 255;
      arr[6] = (v = parseInt(uuid2.slice(14, 18), 16)) >>> 8;
      arr[7] = v & 255;
      arr[8] = (v = parseInt(uuid2.slice(19, 23), 16)) >>> 8;
      arr[9] = v & 255;
      arr[10] = (v = parseInt(uuid2.slice(24, 36), 16)) / 1099511627776 & 255;
      arr[11] = v / 4294967296 & 255;
      arr[12] = v >>> 24 & 255;
      arr[13] = v >>> 16 & 255;
      arr[14] = v >>> 8 & 255;
      arr[15] = v & 255;
      return arr;
    }
    __name(parse2, "parse");
    var _default = parse2;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v35.js
var require_v35 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v35.js"(exports) {
    "use strict";
    init_define_process();
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
    var URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    exports.URL = URL;
    function _default(name, version3, hashfunc) {
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
        bytes[6] = bytes[6] & 15 | version3;
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
      generateUUID.URL = URL;
      return generateUUID;
    }
    __name(_default, "_default");
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/md5.js
var require_md5 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/md5.js"(exports) {
    "use strict";
    init_define_process();
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
    init_define_process();
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
    var v32 = (0, _v.default)("v3", 48, _md.default);
    var _default = v32;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v4.js
var require_v4 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/v4.js"(exports) {
    "use strict";
    init_define_process();
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
    function v42(options, buf, offset) {
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
    __name(v42, "v4");
    var _default = v42;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/sha1.js
var require_sha1 = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/sha1.js"(exports) {
    "use strict";
    init_define_process();
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
    init_define_process();
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
    var v52 = (0, _v.default)("v5", 80, _sha.default);
    var _default = v52;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/nil.js
var require_nil = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/nil.js"(exports) {
    "use strict";
    init_define_process();
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
    init_define_process();
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = void 0;
    var _validate = _interopRequireDefault(require_validate());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    __name(_interopRequireDefault, "_interopRequireDefault");
    function version3(uuid2) {
      if (!(0, _validate.default)(uuid2)) {
        throw TypeError("Invalid UUID");
      }
      return parseInt(uuid2.substr(14, 1), 16);
    }
    __name(version3, "version");
    var _default = version3;
    exports.default = _default;
  }
});

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/dist/index.js"(exports) {
    "use strict";
    init_define_process();
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

// src/primitives/crypto.js
var crypto_exports = {};
__export(crypto_exports, {
  Crypto: () => Crypto3,
  CryptoKey: () => CryptoKey,
  SubtleCrypto: () => SubtleCrypto3,
  crypto: () => crypto2
});
module.exports = __toCommonJS(crypto_exports);
init_define_process();

// ../../node_modules/.pnpm/@peculiar+webcrypto@1.4.0/node_modules/@peculiar/webcrypto/build/webcrypto.es.js
init_define_process();

// ../../node_modules/.pnpm/webcrypto-core@1.7.5/node_modules/webcrypto-core/build/webcrypto-core.es.js
init_define_process();

// ../../node_modules/.pnpm/pvtsutils@1.3.2/node_modules/pvtsutils/build/index.es.js
init_define_process();
var ARRAY_BUFFER_NAME = "[object ArrayBuffer]";
var BufferSourceConverter = class {
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
var Utf8Converter = class {
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
var Utf16Converter = class {
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
var Convert = class {
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
__name(combine, "combine");

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/index.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/converters.js
init_define_process();

// ../../node_modules/.pnpm/asn1js@3.0.5/node_modules/asn1js/build/index.es.js
var index_es_exports = {};
__export(index_es_exports, {
  Any: () => Any,
  BaseBlock: () => BaseBlock,
  BaseStringBlock: () => BaseStringBlock,
  BitString: () => BitString,
  BmpString: () => BmpString,
  Boolean: () => Boolean,
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
  Set: () => Set,
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
init_define_process();

// ../../node_modules/.pnpm/pvutils@1.1.3/node_modules/pvutils/build/utils.es.js
init_define_process();
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
__name(utilFromBase, "utilFromBase");
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
__name(utilToBase, "utilToBase");
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
__name(utilConcatView, "utilConcatView");
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
__name(utilDecodeTC, "utilDecodeTC");
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
__name(utilEncodeTC, "utilEncodeTC");
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
__name(isEqualBuffer, "isEqualBuffer");
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
__name(padNumber, "padNumber");
var log2 = Math.log(2);

// ../../node_modules/.pnpm/asn1js@3.0.5/node_modules/asn1js/build/index.es.js
function assertBigInt() {
  if (typeof BigInt === "undefined") {
    throw new Error("BigInt is not defined. Your environment doesn't implement BigInt.");
  }
}
__name(assertBigInt, "assertBigInt");
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
__name(concat, "concat");
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
__name(checkBufferParams, "checkBufferParams");
var ViewWriter = class {
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
var powers2 = [new Uint8Array([1])];
var digitsString = "0123456789";
var NAME = "name";
var VALUE_HEX_VIEW = "valueHexView";
var IS_HEX_ONLY = "isHexOnly";
var ID_BLOCK = "idBlock";
var TAG_CLASS = "tagClass";
var TAG_NUMBER = "tagNumber";
var IS_CONSTRUCTED = "isConstructed";
var FROM_BER = "fromBER";
var TO_BER = "toBER";
var LOCAL = "local";
var EMPTY_STRING = "";
var EMPTY_BUFFER = new ArrayBuffer(0);
var EMPTY_VIEW = new Uint8Array(0);
var END_OF_CONTENT_NAME = "EndOfContent";
var OCTET_STRING_NAME = "OCTET STRING";
var BIT_STRING_NAME = "BIT STRING";
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
__name(HexBlock, "HexBlock");
var LocalBaseBlock = class {
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
var ValueBlock = class extends LocalBaseBlock {
  fromBER(inputBuffer, inputOffset, inputLength) {
    throw TypeError("User need to make a specific function in a class which extends 'ValueBlock'");
  }
  toBER(sizeOnly, writer) {
    throw TypeError("User need to make a specific function in a class which extends 'ValueBlock'");
  }
};
__name(ValueBlock, "ValueBlock");
ValueBlock.NAME = "valueBlock";
var LocalIdentificationBlock = class extends HexBlock(LocalBaseBlock) {
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
var LocalLengthBlock = class extends LocalBaseBlock {
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
var typeStore = {};
var BaseBlock = class extends LocalBaseBlock {
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
__name(prepareIndefiniteForm, "prepareIndefiniteForm");
var BaseStringBlock = class extends BaseBlock {
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
var LocalPrimitiveValueBlock = class extends HexBlock(ValueBlock) {
  constructor({ isHexOnly = true, ...parameters } = {}) {
    super(parameters);
    this.isHexOnly = isHexOnly;
  }
};
__name(LocalPrimitiveValueBlock, "LocalPrimitiveValueBlock");
LocalPrimitiveValueBlock.NAME = "PrimitiveValueBlock";
var _a$w;
var Primitive = class extends BaseBlock {
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
__name(localChangeType, "localChangeType");
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
__name(localFromBER, "localFromBER");
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
__name(fromBER, "fromBER");
function checkLen(indefiniteLength, length) {
  if (indefiniteLength) {
    return 1;
  }
  return length;
}
__name(checkLen, "checkLen");
var LocalConstructedValueBlock = class extends ValueBlock {
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
var _a$v;
var Constructed = class extends BaseBlock {
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
var LocalEndOfContentValueBlock = class extends ValueBlock {
  fromBER(inputBuffer, inputOffset, inputLength) {
    return inputOffset;
  }
  toBER(sizeOnly) {
    return EMPTY_BUFFER;
  }
};
__name(LocalEndOfContentValueBlock, "LocalEndOfContentValueBlock");
LocalEndOfContentValueBlock.override = "EndOfContentValueBlock";
var _a$u;
var EndOfContent = class extends BaseBlock {
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
var _a$t;
var Null = class extends BaseBlock {
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
var LocalBooleanValueBlock = class extends HexBlock(ValueBlock) {
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
var _a$s;
var Boolean = class extends BaseBlock {
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
__name(Boolean, "Boolean");
_a$s = Boolean;
(() => {
  typeStore.Boolean = _a$s;
})();
Boolean.NAME = "BOOLEAN";
var LocalOctetStringValueBlock = class extends HexBlock(LocalConstructedValueBlock) {
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
var _a$r;
var OctetString = class extends BaseBlock {
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
var LocalBitStringValueBlock = class extends HexBlock(LocalConstructedValueBlock) {
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
var _a$q;
var BitString = class extends BaseBlock {
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
var _a$p;
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
__name(viewAdd, "viewAdd");
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
__name(power2, "power2");
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
__name(viewSub, "viewSub");
var LocalIntegerValueBlock = class extends HexBlock(ValueBlock) {
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
var _a$o;
var Integer = class extends BaseBlock {
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
var _a$n;
var Enumerated = class extends Integer {
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
var LocalSidValueBlock = class extends HexBlock(ValueBlock) {
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
var LocalObjectIdentifierValueBlock = class extends ValueBlock {
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
var _a$m;
var ObjectIdentifier = class extends BaseBlock {
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
var LocalRelativeSidValueBlock = class extends HexBlock(LocalBaseBlock) {
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
var LocalRelativeObjectIdentifierValueBlock = class extends ValueBlock {
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
var _a$l;
var RelativeObjectIdentifier = class extends BaseBlock {
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
var _a$k;
var Sequence = class extends Constructed {
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
var _a$j;
var Set = class extends Constructed {
  constructor(parameters = {}) {
    super(parameters);
    this.idBlock.tagClass = 1;
    this.idBlock.tagNumber = 17;
  }
};
__name(Set, "Set");
_a$j = Set;
(() => {
  typeStore.Set = _a$j;
})();
Set.NAME = "SET";
var LocalStringValueBlock = class extends HexBlock(ValueBlock) {
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
var LocalSimpleStringValueBlock = class extends LocalStringValueBlock {
};
__name(LocalSimpleStringValueBlock, "LocalSimpleStringValueBlock");
LocalSimpleStringValueBlock.NAME = "SimpleStringValueBlock";
var LocalSimpleStringBlock = class extends BaseStringBlock {
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
var LocalUtf8StringValueBlock = class extends LocalSimpleStringBlock {
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
var _a$i;
var Utf8String = class extends LocalUtf8StringValueBlock {
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
var LocalBmpStringValueBlock = class extends LocalSimpleStringBlock {
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
var _a$h;
var BmpString = class extends LocalBmpStringValueBlock {
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
var LocalUniversalStringValueBlock = class extends LocalSimpleStringBlock {
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
var _a$g;
var UniversalString = class extends LocalUniversalStringValueBlock {
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
var _a$f;
var NumericString = class extends LocalSimpleStringBlock {
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
var _a$e;
var PrintableString = class extends LocalSimpleStringBlock {
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
var _a$d;
var TeletexString = class extends LocalSimpleStringBlock {
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
var _a$c;
var VideotexString = class extends LocalSimpleStringBlock {
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
var _a$b;
var IA5String = class extends LocalSimpleStringBlock {
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
var _a$a;
var GraphicString = class extends LocalSimpleStringBlock {
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
var _a$9;
var VisibleString = class extends LocalSimpleStringBlock {
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
var _a$8;
var GeneralString = class extends LocalSimpleStringBlock {
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
var _a$7;
var CharacterString = class extends LocalSimpleStringBlock {
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
var _a$6;
var UTCTime = class extends VisibleString {
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
var _a$5;
var GeneralizedTime = class extends UTCTime {
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
var _a$4;
var DATE = class extends Utf8String {
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
var _a$3;
var TimeOfDay = class extends Utf8String {
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
var _a$2;
var DateTime = class extends Utf8String {
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
var _a$1;
var Duration = class extends Utf8String {
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
var _a;
var TIME = class extends Utf8String {
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
var Any = class {
  constructor({ name = EMPTY_STRING, optional = false } = {}) {
    this.name = name;
    this.optional = optional;
  }
};
__name(Any, "Any");
var Choice = class extends Any {
  constructor({ value = [], ...parameters } = {}) {
    super(parameters);
    this.value = value;
  }
};
__name(Choice, "Choice");
var Repeated = class extends Any {
  constructor({ value = new Any(), local = false, ...parameters } = {}) {
    super(parameters);
    this.value = value;
    this.local = local;
  }
};
__name(Repeated, "Repeated");
var RawData = class {
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
__name(compareSchema, "compareSchema");
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
__name(verifySchema, "verifySchema");

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/enums.js
init_define_process();
var AsnTypeTypes;
(function(AsnTypeTypes2) {
  AsnTypeTypes2[AsnTypeTypes2["Sequence"] = 0] = "Sequence";
  AsnTypeTypes2[AsnTypeTypes2["Set"] = 1] = "Set";
  AsnTypeTypes2[AsnTypeTypes2["Choice"] = 2] = "Choice";
})(AsnTypeTypes || (AsnTypeTypes = {}));
var AsnPropTypes;
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

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/converters.js
var AsnAnyConverter = {
  fromASN: (value) => value instanceof Null ? null : value.valueBeforeDecodeView,
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
var AsnIntegerConverter = {
  fromASN: (value) => value.valueBlock.valueHexView.byteLength >= 4 ? value.valueBlock.toString() : value.valueBlock.valueDec,
  toASN: (value) => new Integer({ value: +value })
};
var AsnEnumeratedConverter = {
  fromASN: (value) => value.valueBlock.valueDec,
  toASN: (value) => new Enumerated({ value })
};
var AsnBitStringConverter = {
  fromASN: (value) => value.valueBlock.valueHexView,
  toASN: (value) => new BitString({ valueHex: value })
};
var AsnObjectIdentifierConverter = {
  fromASN: (value) => value.valueBlock.toString(),
  toASN: (value) => new ObjectIdentifier({ value })
};
var AsnBooleanConverter = {
  fromASN: (value) => value.valueBlock.value,
  toASN: (value) => new Boolean({ value })
};
var AsnOctetStringConverter = {
  fromASN: (value) => value.valueBlock.valueHexView,
  toASN: (value) => new OctetString({ valueHex: value })
};
function createStringConverter(Asn1Type) {
  return {
    fromASN: (value) => value.valueBlock.value,
    toASN: (value) => new Asn1Type({ value })
  };
}
__name(createStringConverter, "createStringConverter");
var AsnUtf8StringConverter = createStringConverter(Utf8String);
var AsnBmpStringConverter = createStringConverter(BmpString);
var AsnUniversalStringConverter = createStringConverter(UniversalString);
var AsnNumericStringConverter = createStringConverter(NumericString);
var AsnPrintableStringConverter = createStringConverter(PrintableString);
var AsnTeletexStringConverter = createStringConverter(TeletexString);
var AsnVideotexStringConverter = createStringConverter(VideotexString);
var AsnIA5StringConverter = createStringConverter(IA5String);
var AsnGraphicStringConverter = createStringConverter(GraphicString);
var AsnVisibleStringConverter = createStringConverter(VisibleString);
var AsnGeneralStringConverter = createStringConverter(GeneralString);
var AsnCharacterStringConverter = createStringConverter(CharacterString);
var AsnUTCTimeConverter = {
  fromASN: (value) => value.toDate(),
  toASN: (value) => new UTCTime({ valueDate: value })
};
var AsnGeneralizedTimeConverter = {
  fromASN: (value) => value.toDate(),
  toASN: (value) => new GeneralizedTime({ valueDate: value })
};
var AsnNullConverter = {
  fromASN: () => null,
  toASN: () => {
    return new Null();
  }
};
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
__name(defaultConverter, "defaultConverter");

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/types/index.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/types/bit_string.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/types/octet_string.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/decorators.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/storage.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/schema.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/helper.js
init_define_process();
function isConvertible(target) {
  if (typeof target === "function" && target.prototype) {
    if (target.prototype.toASN && target.prototype.fromASN) {
      return true;
    } else {
      return isConvertible(target.prototype);
    }
  } else {
    return !!(target && typeof target === "object" && "toASN" in target && "fromASN" in target);
  }
}
__name(isConvertible, "isConvertible");
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
__name(isTypeOfArray, "isTypeOfArray");
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
__name(isArrayEqual, "isArrayEqual");

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/schema.js
var AsnSchemaStorage = class {
  constructor() {
    this.items = /* @__PURE__ */ new WeakMap();
  }
  has(target) {
    return this.items.has(target);
  }
  get(target, checkSchema = false) {
    const schema = this.items.get(target);
    if (!schema) {
      throw new Error(`Cannot get schema for '${target.prototype.constructor.name}' target`);
    }
    if (checkSchema && !schema.schema) {
      throw new Error(`Schema '${target.prototype.constructor.name}' doesn't contain ASN.1 schema. Call 'AsnSchemaStorage.cache'.`);
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
        const Container = item.repeated === "set" ? Set : Sequence;
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
            let value = !isRepeated ? this.get(item.type, true).schema : asn1Item;
            value = "valueBlock" in value ? value.valueBlock.value : value.value;
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
        return new Set({ value: asn1Value, name: "" });
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

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/storage.js
var schemaStorage = new AsnSchemaStorage();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/decorators.js
var AsnType = /* @__PURE__ */ __name((options) => (target) => {
  let schema;
  if (!schemaStorage.has(target)) {
    schema = schemaStorage.createDefault(target);
    schemaStorage.set(target, schema);
  } else {
    schema = schemaStorage.get(target);
  }
  Object.assign(schema, options);
}, "AsnType");
var AsnProp = /* @__PURE__ */ __name((options) => (target, propertyKey) => {
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

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/parser.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/errors/index.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/errors/schema_validation.js
init_define_process();
var AsnSchemaValidationError = class extends Error {
  constructor() {
    super(...arguments);
    this.schemas = [];
  }
};
__name(AsnSchemaValidationError, "AsnSchemaValidationError");

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/parser.js
var AsnParser = class {
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
        if (!("value" in asn1Schema.valueBlock && Array.isArray(asn1Schema.valueBlock.value))) {
          throw new Error(`Cannot get items from the ASN.1 parsed value. ASN.1 object is not constructed.`);
        }
        const itemType = schema.itemType;
        if (typeof itemType === "number") {
          const converter = defaultConverter(itemType);
          if (!converter) {
            throw new Error(`Cannot get default converter for array item of ${target.name} ASN1 schema`);
          }
          return target.from(asn1Schema.valueBlock.value, (element) => converter.fromASN(element));
        } else {
          return target.from(asn1Schema.valueBlock.value, (element) => this.fromASN(element, itemType));
        }
      }
      for (const key in schema.items) {
        const asn1SchemaValue = asn1ComparedSchema.result[key];
        if (!asn1SchemaValue) {
          continue;
        }
        const schemaItem = schema.items[key];
        const schemaItemType = schemaItem.type;
        if (typeof schemaItemType === "number" || isConvertible(schemaItemType)) {
          const converter = (_a2 = schemaItem.converter) !== null && _a2 !== void 0 ? _a2 : isConvertible(schemaItemType) ? new schemaItemType() : null;
          if (!converter) {
            throw new Error("Converter is empty");
          }
          if (schemaItem.repeated) {
            if (schemaItem.implicit) {
              const Container = schemaItem.repeated === "sequence" ? Sequence : Set;
              const newItem = new Container();
              newItem.valueBlock = asn1SchemaValue.valueBlock;
              const newItemAsn = fromBER(newItem.toBER(false));
              if (newItemAsn.offset === -1) {
                throw new Error(`Cannot parse the child item. ${newItemAsn.result.error}`);
              }
              if (!("value" in newItemAsn.result.valueBlock && Array.isArray(newItemAsn.result.valueBlock.value))) {
                throw new Error("Cannot get items from the ASN.1 parsed value. ASN.1 object is not constructed.");
              }
              const value = newItemAsn.result.valueBlock.value;
              res[key] = Array.from(value, (element) => converter.fromASN(element));
            } else {
              res[key] = Array.from(asn1SchemaValue, (element) => converter.fromASN(element));
            }
          } else {
            let value = asn1SchemaValue;
            if (schemaItem.implicit) {
              let newItem;
              if (isConvertible(schemaItemType)) {
                newItem = new schemaItemType().toSchema("");
              } else {
                const Asn1TypeName = AsnPropTypes[schemaItemType];
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
            if (!Array.isArray(asn1SchemaValue)) {
              throw new Error("Cannot get list of items from the ASN.1 parsed value. ASN.1 value should be iterable.");
            }
            res[key] = Array.from(asn1SchemaValue, (element) => this.fromASN(element, schemaItemType));
          } else {
            res[key] = this.fromASN(asn1SchemaValue, schemaItemType);
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

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/serializer.js
init_define_process();
var AsnSerializer = class {
  static serialize(obj) {
    if (obj instanceof BaseBlock) {
      return obj.toBER(false);
    }
    return this.toASN(obj).toBER(false);
  }
  static toASN(obj) {
    if (obj && typeof obj === "object" && isConvertible(obj)) {
      return obj.toASN();
    }
    if (!(obj && typeof obj === "object")) {
      throw new TypeError("Parameter 1 should be type of Object.");
    }
    const target = obj.constructor;
    const schema = schemaStorage.get(target);
    schemaStorage.cache(target);
    let asn1Value = [];
    if (schema.itemType) {
      if (!Array.isArray(obj)) {
        throw new TypeError("Parameter 1 should be type of Array.");
      }
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
        const asn1Item = AsnSerializer.toAsnItem(schemaItem, key, target, objProp);
        if (typeof schemaItem.context === "number") {
          if (schemaItem.implicit) {
            if (!schemaItem.repeated && (typeof schemaItem.type === "number" || isConvertible(schemaItem.type))) {
              const value = {};
              value.valueHex = asn1Item instanceof Null ? asn1Item.valueBeforeDecodeView : asn1Item.valueBlock.toBER();
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
        asnSchema = new Set({ value: asn1Value });
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
        if (!Array.isArray(objProp)) {
          throw new TypeError("Parameter 'objProp' should be type of Array.");
        }
        const items = Array.from(objProp, (element) => converter.toASN(element));
        const Container = schemaItem.repeated === "sequence" ? Sequence : Set;
        asn1Item = new Container({
          value: items
        });
      } else {
        asn1Item = converter.toASN(objProp);
      }
    } else {
      if (schemaItem.repeated) {
        if (!Array.isArray(objProp)) {
          throw new TypeError("Parameter 'objProp' should be type of Array.");
        }
        const items = Array.from(objProp, (element) => this.toASN(element));
        const Container = schemaItem.repeated === "sequence" ? Sequence : Set;
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

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/objects.js
init_define_process();

// ../../node_modules/.pnpm/@peculiar+asn1-schema@2.3.0/node_modules/@peculiar/asn1-schema/build/es2015/convert.js
init_define_process();
var AsnConvert = class {
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

// ../../node_modules/.pnpm/tslib@2.4.0/node_modules/tslib/modules/index.js
init_define_process();
var import_tslib = __toESM(require_tslib(), 1);
var {
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
} = import_tslib.default;

// ../../node_modules/.pnpm/@peculiar+json-schema@1.1.12/node_modules/@peculiar/json-schema/build/index.es.js
init_define_process();
var JsonError = class extends Error {
  constructor(message, innerError) {
    super(innerError ? `${message}. See the inner exception for more details.` : message);
    this.message = message;
    this.innerError = innerError;
  }
};
__name(JsonError, "JsonError");
var TransformError = class extends JsonError {
  constructor(schema, message, innerError) {
    super(message, innerError);
    this.schema = schema;
  }
};
__name(TransformError, "TransformError");
var ParserError = class extends TransformError {
  constructor(schema, message, innerError) {
    super(schema, `JSON doesn't match to '${schema.target.name}' schema. ${message}`, innerError);
  }
};
__name(ParserError, "ParserError");
var ValidationError = class extends JsonError {
};
__name(ValidationError, "ValidationError");
var SerializerError = class extends JsonError {
  constructor(schemaName, message, innerError) {
    super(`Cannot serialize by '${schemaName}' schema. ${message}`, innerError);
    this.schemaName = schemaName;
  }
};
__name(SerializerError, "SerializerError");
var KeyError = class extends ParserError {
  constructor(schema, keys, errors = {}) {
    super(schema, "Some keys doesn't match to schema");
    this.keys = keys;
    this.errors = errors;
  }
};
__name(KeyError, "KeyError");
var JsonPropTypes;
(function(JsonPropTypes2) {
  JsonPropTypes2[JsonPropTypes2["Any"] = 0] = "Any";
  JsonPropTypes2[JsonPropTypes2["Boolean"] = 1] = "Boolean";
  JsonPropTypes2[JsonPropTypes2["Number"] = 2] = "Number";
  JsonPropTypes2[JsonPropTypes2["String"] = 3] = "String";
})(JsonPropTypes || (JsonPropTypes = {}));
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
__name(checkType, "checkType");
function throwIfTypeIsWrong(value, type) {
  if (!checkType(value, type)) {
    throw new TypeError(`Value must be ${JsonPropTypes[type]}`);
  }
}
__name(throwIfTypeIsWrong, "throwIfTypeIsWrong");
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
__name(isConvertible2, "isConvertible");
var JsonSchemaStorage = class {
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
var DEFAULT_SCHEMA = "default";
var schemaStorage2 = new JsonSchemaStorage();
var PatternValidation = class {
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
var InclusiveValidation = class {
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
var ExclusiveValidation = class {
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
var LengthValidation = class {
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
var EnumerationValidation = class {
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
var JsonTransform = class {
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
var JsonSerializer = class extends JsonTransform {
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
var JsonParser = class extends JsonTransform {
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
__name(getValidations, "getValidations");
var JsonProp = /* @__PURE__ */ __name((options = {}) => (target, propertyKey) => {
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

// ../../node_modules/.pnpm/webcrypto-core@1.7.5/node_modules/webcrypto-core/build/webcrypto-core.es.js
var CryptoError = class extends Error {
};
__name(CryptoError, "CryptoError");
var AlgorithmError = class extends CryptoError {
};
__name(AlgorithmError, "AlgorithmError");
var UnsupportedOperationError = class extends CryptoError {
  constructor(methodName) {
    super(`Unsupported operation: ${methodName ? `${methodName}` : ""}`);
  }
};
__name(UnsupportedOperationError, "UnsupportedOperationError");
var OperationError = class extends CryptoError {
};
__name(OperationError, "OperationError");
var RequiredPropertyError = class extends CryptoError {
  constructor(propName) {
    super(`${propName}: Missing required property`);
  }
};
__name(RequiredPropertyError, "RequiredPropertyError");
function isJWK(data) {
  return typeof data === "object" && "kty" in data;
}
__name(isJWK, "isJWK");
var ProviderCrypto = class {
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
var AesProvider = class extends ProviderCrypto {
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
var AesCbcProvider = class extends AesProvider {
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
var AesCmacProvider = class extends AesProvider {
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
var AesCtrProvider = class extends AesProvider {
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
var AesEcbProvider = class extends AesProvider {
  constructor() {
    super(...arguments);
    this.name = "AES-ECB";
    this.usages = ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
  }
};
__name(AesEcbProvider, "AesEcbProvider");
var AesGcmProvider = class extends AesProvider {
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
var AesKwProvider = class extends AesProvider {
  constructor() {
    super(...arguments);
    this.name = "AES-KW";
    this.usages = ["wrapKey", "unwrapKey"];
  }
};
__name(AesKwProvider, "AesKwProvider");
var DesProvider = class extends ProviderCrypto {
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
var RsaProvider = class extends ProviderCrypto {
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
var RsaSsaProvider = class extends RsaProvider {
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
var RsaPssProvider = class extends RsaProvider {
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
var RsaOaepProvider = class extends RsaProvider {
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
var EllipticProvider = class extends ProviderCrypto {
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
var EcdsaProvider = class extends EllipticProvider {
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
var KEY_TYPES = ["secret", "private", "public"];
var CryptoKey = class {
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
var EcdhProvider = class extends EllipticProvider {
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
var EcdhEsProvider = class extends EcdhProvider {
  constructor() {
    super(...arguments);
    this.name = "ECDH-ES";
    this.namedCurves = ["X25519", "X448"];
  }
};
__name(EcdhEsProvider, "EcdhEsProvider");
var EdDsaProvider = class extends EllipticProvider {
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
var ObjectIdentifier2 = /* @__PURE__ */ __name(class ObjectIdentifier3 {
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
var AlgorithmIdentifier = class {
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
var PrivateKeyInfo = class {
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
var PublicKeyInfo = class {
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
var JsonBase64UrlArrayBufferConverter = {
  fromJSON: (value) => Convert.FromBase64Url(value),
  toJSON: (value) => Convert.ToBase64Url(new Uint8Array(value))
};
var AsnIntegerArrayBufferConverter = {
  fromASN: (value) => {
    const valueHex = value.valueBlock.valueHex;
    return !new Uint8Array(valueHex)[0] ? value.valueBlock.valueHex.slice(1) : value.valueBlock.valueHex;
  },
  toASN: (value) => {
    const valueHex = new Uint8Array(value)[0] > 127 ? combine(new Uint8Array([0]).buffer, value) : value;
    return new Integer({ valueHex });
  }
};
var RsaPrivateKey = class {
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
var RsaPublicKey = class {
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
var EcPublicKey = /* @__PURE__ */ __name(class EcPublicKey2 {
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
var EcPrivateKey = class {
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
var AsnIntegerWithoutPaddingConverter = {
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
var index$2 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  AsnIntegerWithoutPaddingConverter
});
var EcUtils = class {
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
var EcDsaSignature = class {
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
var OneAsymmetricKey = class extends PrivateKeyInfo {
};
__name(OneAsymmetricKey, "OneAsymmetricKey");
__decorate([
  AsnProp({ context: 1, implicit: true, type: AsnPropTypes.BitString, optional: true })
], OneAsymmetricKey.prototype, "publicKey", void 0);
var EdPrivateKey = /* @__PURE__ */ __name(class EdPrivateKey2 {
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
var EdPublicKey = /* @__PURE__ */ __name(class EdPublicKey2 {
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
var CurvePrivateKey = /* @__PURE__ */ __name(class CurvePrivateKey2 {
}, "CurvePrivateKey");
__decorate([
  AsnProp({ type: AsnPropTypes.OctetString }),
  JsonProp({ type: JsonPropTypes.String, converter: JsonBase64UrlArrayBufferConverter })
], CurvePrivateKey.prototype, "d", void 0);
CurvePrivateKey = __decorate([
  AsnType({ type: AsnTypeTypes.Choice })
], CurvePrivateKey);
var idSecp256r1 = "1.2.840.10045.3.1.7";
var idEllipticCurve = "1.3.132.0";
var idSecp384r1 = `${idEllipticCurve}.34`;
var idSecp521r1 = `${idEllipticCurve}.35`;
var idSecp256k1 = `${idEllipticCurve}.10`;
var idVersionOne = "1.3.36.3.3.2.8.1.1";
var idBrainpoolP160r1 = `${idVersionOne}.1`;
var idBrainpoolP160t1 = `${idVersionOne}.2`;
var idBrainpoolP192r1 = `${idVersionOne}.3`;
var idBrainpoolP192t1 = `${idVersionOne}.4`;
var idBrainpoolP224r1 = `${idVersionOne}.5`;
var idBrainpoolP224t1 = `${idVersionOne}.6`;
var idBrainpoolP256r1 = `${idVersionOne}.7`;
var idBrainpoolP256t1 = `${idVersionOne}.8`;
var idBrainpoolP320r1 = `${idVersionOne}.9`;
var idBrainpoolP320t1 = `${idVersionOne}.10`;
var idBrainpoolP384r1 = `${idVersionOne}.11`;
var idBrainpoolP384t1 = `${idVersionOne}.12`;
var idBrainpoolP512r1 = `${idVersionOne}.13`;
var idBrainpoolP512t1 = `${idVersionOne}.14`;
var idX25519 = "1.3.101.110";
var idX448 = "1.3.101.111";
var idEd25519 = "1.3.101.112";
var idEd448 = "1.3.101.113";
var index$1 = /* @__PURE__ */ Object.freeze({
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
var EcCurves = class {
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
var HmacProvider = class extends ProviderCrypto {
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
var Pbkdf2Provider = class extends ProviderCrypto {
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
var HkdfProvider = class extends ProviderCrypto {
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
var ShakeProvider = class extends ProviderCrypto {
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
var Shake128Provider = class extends ShakeProvider {
  constructor() {
    super(...arguments);
    this.name = "shake128";
    this.defaultLength = 16;
  }
};
__name(Shake128Provider, "Shake128Provider");
var Shake256Provider = class extends ShakeProvider {
  constructor() {
    super(...arguments);
    this.name = "shake256";
    this.defaultLength = 32;
  }
};
__name(Shake256Provider, "Shake256Provider");
var Crypto = class {
  get [Symbol.toStringTag]() {
    return "Crypto";
  }
  randomUUID() {
    const b = this.getRandomValues(new Uint8Array(16));
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const uuid2 = Convert.ToHex(b).toLowerCase();
    return `${uuid2.substring(0, 8)}-${uuid2.substring(8, 12)}-${uuid2.substring(12, 16)}-${uuid2.substring(16)}`;
  }
};
__name(Crypto, "Crypto");
var ProviderStorage = class {
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
var SubtleCrypto = class {
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

// ../../node_modules/.pnpm/@peculiar+webcrypto@1.4.0/node_modules/@peculiar/webcrypto/build/webcrypto.es.js
var crypto = __toESM(require("crypto"));
var import_crypto = __toESM(require("crypto"));
var process = __toESM(require("process"));
var JsonBase64UrlConverter = {
  fromJSON: (value) => Buffer.from(Convert.FromBase64Url(value)),
  toJSON: (value) => Convert.ToBase64Url(value)
};
var CryptoKey2 = class extends CryptoKey {
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
var SymmetricKey = class extends CryptoKey2 {
  constructor() {
    super(...arguments);
    this.kty = "oct";
    this.type = "secret";
  }
};
__name(SymmetricKey, "SymmetricKey");
var AsymmetricKey = class extends CryptoKey2 {
};
__name(AsymmetricKey, "AsymmetricKey");
var AesCryptoKey = class extends SymmetricKey {
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
var keyStorage = /* @__PURE__ */ new WeakMap();
function getCryptoKey(key) {
  const res = keyStorage.get(key);
  if (!res) {
    throw new OperationError("Cannot get CryptoKey from secure storage");
  }
  return res;
}
__name(getCryptoKey, "getCryptoKey");
function setCryptoKey(value) {
  const key = CryptoKey.create(value.algorithm, value.type, value.extractable, value.usages);
  Object.freeze(key);
  keyStorage.set(key, value);
  return key;
}
__name(setCryptoKey, "setCryptoKey");
var AesCrypto = class {
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
var AesCbcProvider2 = class extends AesCbcProvider {
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
var zero = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
var rb = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 135]);
var blockSize = 16;
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
__name(bitShiftLeft, "bitShiftLeft");
function xor(a, b) {
  const length = Math.min(a.length, b.length);
  const output = Buffer.alloc(length);
  for (let index = 0; index < length; index++) {
    output[index] = a[index] ^ b[index];
  }
  return output;
}
__name(xor, "xor");
function aes(key, message) {
  const cipher = crypto.createCipheriv(`aes${key.length << 3}`, key, zero);
  const result = cipher.update(message);
  cipher.final();
  return result;
}
__name(aes, "aes");
function getMessageBlock(message, blockIndex) {
  const block = Buffer.alloc(blockSize);
  const start = blockIndex * blockSize;
  const end = start + blockSize;
  message.copy(block, 0, start, end);
  return block;
}
__name(getMessageBlock, "getMessageBlock");
function getPaddedMessageBlock(message, blockIndex) {
  const block = Buffer.alloc(blockSize);
  const start = blockIndex * blockSize;
  const end = message.length;
  block.fill(0);
  message.copy(block, 0, start, end);
  block[end - start] = 128;
  return block;
}
__name(getPaddedMessageBlock, "getPaddedMessageBlock");
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
__name(generateSubkeys, "generateSubkeys");
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
__name(aesCmac, "aesCmac");
var AesCmacProvider2 = class extends AesCmacProvider {
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
var AesCtrProvider2 = class extends AesCtrProvider {
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
var AesGcmProvider2 = class extends AesGcmProvider {
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
var AesKwProvider2 = class extends AesKwProvider {
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
var AesEcbProvider2 = class extends AesEcbProvider {
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
var DesCryptoKey = class extends SymmetricKey {
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
var DesCrypto = class {
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
var DesCbcProvider = class extends DesProvider {
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
var DesEde3CbcProvider = class extends DesProvider {
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
__name(getJwkAlgorithm, "getJwkAlgorithm");
var RsaPrivateKey2 = class extends AsymmetricKey {
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
var RsaPublicKey2 = class extends AsymmetricKey {
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
var RsaCrypto = class {
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
var RsaSsaProvider2 = class extends RsaSsaProvider {
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
var RsaPssProvider2 = class extends RsaPssProvider {
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
var ShaCrypto = class {
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
var RsaOaepProvider2 = class extends RsaOaepProvider {
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
var RsaEsProvider = class extends ProviderCrypto {
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
var namedOIDs = {
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
function getOidByNamedCurve$1(namedCurve) {
  const oid = namedOIDs[namedCurve];
  if (!oid) {
    throw new OperationError(`Cannot convert WebCrypto named curve '${namedCurve}' to OID`);
  }
  return oid;
}
__name(getOidByNamedCurve$1, "getOidByNamedCurve$1");
var EcPrivateKey2 = class extends AsymmetricKey {
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
var EcPublicKey3 = class extends AsymmetricKey {
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
var Sha1Provider = class extends ProviderCrypto {
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
var Sha256Provider = class extends ProviderCrypto {
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
var Sha384Provider = class extends ProviderCrypto {
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
var Sha512Provider = class extends ProviderCrypto {
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
var Sha3256Provider = class extends ProviderCrypto {
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
var Sha3384Provider = class extends ProviderCrypto {
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
var Sha3512Provider = class extends ProviderCrypto {
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
var EcCrypto = class {
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
var EcdsaProvider2 = class extends EcdsaProvider {
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
var EcdhProvider2 = class extends EcdhProvider {
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
var edOIDs = {
  [index$1.idEd448]: "Ed448",
  "ed448": index$1.idEd448,
  [index$1.idX448]: "X448",
  "x448": index$1.idX448,
  [index$1.idEd25519]: "Ed25519",
  "ed25519": index$1.idEd25519,
  [index$1.idX25519]: "X25519",
  "x25519": index$1.idX25519
};
function getOidByNamedCurve(namedCurve) {
  const oid = edOIDs[namedCurve.toLowerCase()];
  if (!oid) {
    throw new OperationError(`Cannot convert WebCrypto named curve '${namedCurve}' to OID`);
  }
  return oid;
}
__name(getOidByNamedCurve, "getOidByNamedCurve");
var EdPrivateKey3 = class extends AsymmetricKey {
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
var EdPublicKey3 = class extends AsymmetricKey {
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
var EdCrypto = class {
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
var EdDsaProvider2 = class extends EdDsaProvider {
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
var EcdhEsProvider2 = class extends EcdhEsProvider {
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
var PbkdfCryptoKey = class extends CryptoKey2 {
};
__name(PbkdfCryptoKey, "PbkdfCryptoKey");
var Pbkdf2Provider2 = class extends Pbkdf2Provider {
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
var HmacCryptoKey = class extends CryptoKey2 {
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
var HmacProvider2 = class extends HmacProvider {
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
var HkdfCryptoKey = class extends CryptoKey2 {
};
__name(HkdfCryptoKey, "HkdfCryptoKey");
var HkdfProvider2 = class extends HkdfProvider {
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
var ShakeCrypto = class {
  static digest(algorithm, data) {
    const hash = import_crypto.default.createHash(algorithm.name.toLowerCase(), { outputLength: algorithm.length }).update(Buffer.from(data)).digest();
    return new Uint8Array(hash).buffer;
  }
};
__name(ShakeCrypto, "ShakeCrypto");
var Shake128Provider2 = class extends Shake128Provider {
  async onDigest(algorithm, data) {
    return ShakeCrypto.digest(algorithm, data);
  }
};
__name(Shake128Provider2, "Shake128Provider");
var Shake256Provider2 = class extends Shake256Provider {
  async onDigest(algorithm, data) {
    return ShakeCrypto.digest(algorithm, data);
  }
};
__name(Shake256Provider2, "Shake256Provider");
var SubtleCrypto2 = class extends SubtleCrypto {
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
    const nodeMajorVersion = (_a2 = /^v(\d+)/.exec(process.version)) === null || _a2 === void 0 ? void 0 : _a2[1];
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
var Crypto2 = class extends Crypto {
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

// ../../node_modules/.pnpm/uuid@8.3.2/node_modules/uuid/wrapper.mjs
init_define_process();
var import_dist = __toESM(require_dist(), 1);
var v1 = import_dist.default.v1;
var v3 = import_dist.default.v3;
var v4 = import_dist.default.v4;
var v5 = import_dist.default.v5;
var NIL = import_dist.default.NIL;
var version2 = import_dist.default.version;
var validate = import_dist.default.validate;
var stringify = import_dist.default.stringify;
var parse = import_dist.default.parse;

// src/primitives/crypto.js
var _randomUUID;
var Crypto3 = class extends Crypto2 {
  constructor() {
    super(...arguments);
    __privateAdd(this, _randomUUID, v4);
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
var crypto2 = new Crypto3();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Crypto,
  CryptoKey,
  SubtleCrypto,
  crypto
});
