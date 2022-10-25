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

// src/request-cookies.ts
var _headers, _parsed;
var RequestCookies = class {
  constructor(requestHeaders) {
    __privateAdd(this, _headers, void 0);
    __privateAdd(this, _parsed, /* @__PURE__ */ new Map());
    __privateSet(this, _headers, requestHeaders);
    const header = requestHeaders.get("cookie");
    if (header) {
      const parsed = parseCookieString(header);
      for (const [name, value] of parsed) {
        __privateGet(this, _parsed).set(name, { name, value });
      }
    }
  }
  [Symbol.iterator]() {
    return __privateGet(this, _parsed)[Symbol.iterator]();
  }
  get size() {
    return __privateGet(this, _parsed).size;
  }
  get(...args) {
    const name = typeof args[0] === "string" ? args[0] : args[0].name;
    return __privateGet(this, _parsed).get(name);
  }
  getAll(...args) {
    var _a;
    const all = Array.from(__privateGet(this, _parsed));
    if (!args.length) {
      return all.map(([_, value]) => value);
    }
    const name = typeof args[0] === "string" ? args[0] : (_a = args[0]) == null ? void 0 : _a.name;
    return all.filter(([n]) => n === name).map(([_, value]) => value);
  }
  has(name) {
    return __privateGet(this, _parsed).has(name);
  }
  set(...args) {
    const [name, value] = args.length === 1 ? [args[0].name, args[0].value] : args;
    const map = __privateGet(this, _parsed);
    map.set(name, { name, value });
    __privateGet(this, _headers).set(
      "cookie",
      Array.from(map).map(([_, value2]) => serialize(value2)).join("; ")
    );
    return this;
  }
  delete(names) {
    const map = __privateGet(this, _parsed);
    const result = !Array.isArray(names) ? map.delete(names) : names.map((name) => map.delete(name));
    __privateGet(this, _headers).set(
      "cookie",
      Array.from(map).map(([_, value]) => serialize(value)).join("; ")
    );
    return result;
  }
  clear() {
    this.delete(Array.from(__privateGet(this, _parsed).keys()));
    return this;
  }
  [Symbol.for("edge-runtime.inspect.custom")]() {
    return `RequestCookies ${JSON.stringify(Object.fromEntries(__privateGet(this, _parsed)))}`;
  }
};
_headers = new WeakMap();
_parsed = new WeakMap();

// src/response-cookies.ts
var _headers2, _parsed2;
var ResponseCookies = class {
  constructor(responseHeaders) {
    __privateAdd(this, _headers2, void 0);
    __privateAdd(this, _parsed2, /* @__PURE__ */ new Map());
    __privateSet(this, _headers2, responseHeaders);
    const headers = __privateGet(this, _headers2).getAll("set-cookie");
    for (const header of headers) {
      const parsed = parseSetCookieString(header);
      if (parsed) {
        __privateGet(this, _parsed2).set(parsed.name, parsed);
      }
    }
  }
  get(...args) {
    const key = typeof args[0] === "string" ? args[0] : args[0].name;
    return __privateGet(this, _parsed2).get(key);
  }
  getAll(...args) {
    var _a;
    const all = Array.from(__privateGet(this, _parsed2).values());
    if (!args.length) {
      return all;
    }
    const key = typeof args[0] === "string" ? args[0] : (_a = args[0]) == null ? void 0 : _a.name;
    return all.filter((c) => c.name === key);
  }
  set(...args) {
    const [name, value, cookie] = args.length === 1 ? [args[0].name, args[0].value, args[0]] : args;
    const map = __privateGet(this, _parsed2);
    map.set(name, normalizeCookie({ name, value, ...cookie }));
    replace(map, __privateGet(this, _headers2));
    return this;
  }
  delete(...args) {
    const name = typeof args[0] === "string" ? args[0] : args[0].name;
    return this.set({ name, value: "", expires: new Date(0) });
  }
  [Symbol.for("edge-runtime.inspect.custom")]() {
    return `ResponseCookies ${JSON.stringify(Object.fromEntries(__privateGet(this, _parsed2)))}`;
  }
};
_headers2 = new WeakMap();
_parsed2 = new WeakMap();
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
