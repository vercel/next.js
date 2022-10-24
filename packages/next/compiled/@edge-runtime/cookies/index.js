"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// src/index.ts
var src_exports = {};
__export(src_exports, {
  RequestCookies: () => RequestCookies,
  ResponseCookies: () => ResponseCookies
});
module.exports = __toCommonJS(src_exports);

// src/serialize.ts
function serialize(c) {
  const attrs = [
    "path" in c && c.path && `Path=${c.path}`,
    "expires" in c && c.expires && `Expires=${c.expires.toUTCString()}`,
    "maxAge" in c && c.maxAge && `Max-Age=${c.maxAge}`,
    "domain" in c && c.domain && `Domain=${c.domain}`,
    "secure" in c && c.secure && "Secure",
    "httpOnly" in c && c.httpOnly && "HttpOnly",
    "sameSite" in c && c.sameSite && `SameSite=${c.sameSite}`
  ].filter(Boolean);
  return `${c.name}=${encodeURIComponent(c.value ?? "")}; ${attrs.join("; ")}`;
}
function parseCookieString(cookie) {
  const map = /* @__PURE__ */ new Map();
  for (const pair of cookie.split(/; */)) {
    if (!pair)
      continue;
    const [key, value] = pair.split("=", 2);
    map.set(key, decodeURIComponent(value ?? "true"));
  }
  return map;
}
function parseSetCookieString(setCookie) {
  if (!setCookie) {
    return void 0;
  }
  const [[name, value], ...attributes] = parseCookieString(setCookie);
  const { domain, expires, httponly, maxage, path, samesite, secure } = Object.fromEntries(
    attributes.map(([key, value2]) => [key.toLowerCase(), value2])
  );
  const cookie = {
    name,
    value: decodeURIComponent(value),
    domain,
    ...expires && { expires: new Date(expires) },
    ...httponly && { httpOnly: true },
    ...typeof maxage === "string" && { maxAge: Number(maxage) },
    path,
    ...samesite && { sameSite: parseSameSite(samesite) },
    ...secure && { secure: true }
  };
  return compact(cookie);
}
function compact(t) {
  const newT = {};
  for (const key in t) {
    if (t[key]) {
      newT[key] = t[key];
    }
  }
  return newT;
}
var SAME_SITE = ["strict", "lax", "none"];
function parseSameSite(string) {
  string = string.toLowerCase();
  return SAME_SITE.includes(string) ? string : void 0;
}

// src/cached.ts
function cached(generate) {
  let cache = void 0;
  return (key) => {
    if ((cache == null ? void 0 : cache.key) !== key) {
      cache = { key, value: generate(key) };
    }
    return cache.value;
  };
}

// src/request-cookies.ts
var _headers, _cache, _parsed, parsed_fn;
var RequestCookies = class {
  constructor(requestHeaders) {
    __privateAdd(this, _parsed);
    __privateAdd(this, _headers, void 0);
    __privateAdd(this, _cache, cached((header) => {
      const parsed = header ? parseCookieString(header) : /* @__PURE__ */ new Map();
      const cached2 = /* @__PURE__ */ new Map();
      for (const [name, value] of parsed) {
        cached2.set(name, { name, value });
      }
      return cached2;
    }));
    __privateSet(this, _headers, requestHeaders);
  }
  [Symbol.iterator]() {
    return __privateMethod(this, _parsed, parsed_fn).call(this)[Symbol.iterator]();
  }
  get size() {
    return __privateMethod(this, _parsed, parsed_fn).call(this).size;
  }
  get(...args) {
    const name = typeof args[0] === "string" ? args[0] : args[0].name;
    return __privateMethod(this, _parsed, parsed_fn).call(this).get(name);
  }
  getAll(...args) {
    var _a;
    const all = Array.from(__privateMethod(this, _parsed, parsed_fn).call(this));
    if (!args.length) {
      return all.map(([_, value]) => value);
    }
    const name = typeof args[0] === "string" ? args[0] : (_a = args[0]) == null ? void 0 : _a.name;
    return all.filter(([n]) => n === name).map(([_, value]) => value);
  }
  has(name) {
    return __privateMethod(this, _parsed, parsed_fn).call(this).has(name);
  }
  set(...args) {
    const [name, value] = args.length === 1 ? [args[0].name, args[0].value] : args;
    const map = __privateMethod(this, _parsed, parsed_fn).call(this);
    map.set(name, { name, value });
    __privateGet(this, _headers).set(
      "cookie",
      Array.from(map).map(([_, value2]) => serialize(value2)).join("; ")
    );
    return this;
  }
  delete(names) {
    const map = __privateMethod(this, _parsed, parsed_fn).call(this);
    const result = !Array.isArray(names) ? map.delete(names) : names.map((name) => map.delete(name));
    __privateGet(this, _headers).set(
      "cookie",
      Array.from(map).map(([_, value]) => serialize(value)).join("; ")
    );
    return result;
  }
  clear() {
    this.delete(Array.from(__privateMethod(this, _parsed, parsed_fn).call(this).keys()));
    return this;
  }
  [Symbol.for("edge-runtime.inspect.custom")]() {
    return `RequestCookies ${JSON.stringify(
      Object.fromEntries(__privateMethod(this, _parsed, parsed_fn).call(this))
    )}`;
  }
};
_headers = new WeakMap();
_cache = new WeakMap();
_parsed = new WeakSet();
parsed_fn = function() {
  const header = __privateGet(this, _headers).get("cookie");
  return __privateGet(this, _cache).call(this, header);
};

// src/response-cookies.ts
var _headers2, _cache2, _parsed2, parsed_fn2;
var ResponseCookies = class {
  constructor(responseHeaders) {
    __privateAdd(this, _parsed2);
    __privateAdd(this, _headers2, void 0);
    __privateAdd(this, _cache2, cached(() => {
      const headers = __privateGet(this, _headers2).getAll("set-cookie");
      const map = /* @__PURE__ */ new Map();
      for (const header of headers) {
        const parsed = parseSetCookieString(header);
        if (parsed) {
          map.set(parsed.name, parsed);
        }
      }
      return map;
    }));
    __privateSet(this, _headers2, responseHeaders);
  }
  get(...args) {
    const key = typeof args[0] === "string" ? args[0] : args[0].name;
    return __privateMethod(this, _parsed2, parsed_fn2).call(this).get(key);
  }
  getAll(...args) {
    var _a;
    const all = Array.from(__privateMethod(this, _parsed2, parsed_fn2).call(this).values());
    if (!args.length) {
      return all;
    }
    const key = typeof args[0] === "string" ? args[0] : (_a = args[0]) == null ? void 0 : _a.name;
    return all.filter((c) => c.name === key);
  }
  set(...args) {
    const [name, value, cookie] = args.length === 1 ? [args[0].name, args[0].value, args[0]] : args;
    const map = __privateMethod(this, _parsed2, parsed_fn2).call(this);
    map.set(name, normalizeCookie({ name, value, ...cookie }));
    replace(map, __privateGet(this, _headers2));
    return this;
  }
  delete(...args) {
    const name = typeof args[0] === "string" ? args[0] : args[0].name;
    return this.set({ name, value: "", expires: new Date(0) });
  }
  [Symbol.for("edge-runtime.inspect.custom")]() {
    return `ResponseCookies ${JSON.stringify(
      Object.fromEntries(__privateMethod(this, _parsed2, parsed_fn2).call(this))
    )}`;
  }
};
_headers2 = new WeakMap();
_cache2 = new WeakMap();
_parsed2 = new WeakSet();
parsed_fn2 = function() {
  const allCookies = __privateGet(this, _headers2).get("set-cookie");
  return __privateGet(this, _cache2).call(this, allCookies);
};
function replace(bag, headers) {
  headers.delete("set-cookie");
  for (const [, value] of bag) {
    const serialized = serialize(value);
    headers.append("set-cookie", serialized);
  }
}
function normalizeCookie(cookie = { name: "", value: "" }) {
  if (cookie.maxAge) {
    cookie.expires = new Date(Date.now() + cookie.maxAge * 1e3);
  }
  if (cookie.path === null || cookie.path === void 0) {
    cookie.path = "/";
  }
  return cookie;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RequestCookies,
  ResponseCookies
});
