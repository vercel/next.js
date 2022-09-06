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

// src/primitives/cache.js
var cache_exports = {};
__export(cache_exports, {
  Cache: () => Cache,
  CacheStorage: () => CacheStorage,
  caches: () => caches,
  createCaches: () => createCaches
});
module.exports = __toCommonJS(cache_exports);
var import_fetch = require("./fetch");
function createCaches() {
  const getKey = /* @__PURE__ */ __name((request) => new URL(request.url).toString(), "getKey");
  const normalizeRequest = /* @__PURE__ */ __name((input, { invokeName }) => {
    if (typeof proxy === "object" && proxy.__normalized__)
      return input;
    const request = input instanceof import_fetch.Request ? input : new import_fetch.Request(input);
    if (request.method !== "GET") {
      throw new TypeError(
        `Failed to execute '${invokeName}' on 'Cache': Request method '${request.method}' is unsupported`
      );
    }
    if (!request.url.startsWith("http")) {
      throw new TypeError(
        `Failed to execute '${invokeName}' on 'Cache': Request scheme '${request.url.split(":")[0]}' is unsupported`
      );
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
      const response = await (0, import_fetch.fetch)(
        normalizeRequest(request, { invokeName: "add" })
      );
      if (!response.ok) {
        throw new TypeError(
          "Failed to execute 'add' on 'Cache': Request failed"
        );
      }
      return this.put(request, response);
    }
    async addAll(requests) {
      await Promise.all(requests.map((request) => this.add(request)));
    }
    async match(request) {
      const key = getKey(normalizeRequest(request, { invokeName: "match" }));
      const cached = this.store.get(key);
      return cached ? new import_fetch.Response(cached.body, cached.init) : void 0;
    }
    async delete(request) {
      const key = getKey(normalizeRequest(request, { invokeName: "delete" }));
      return this.store.delete(key);
    }
    async put(request, response) {
      if (response.status === 206) {
        throw new TypeError(
          "Failed to execute 'put' on 'Cache': Partial response (status code 206) is unsupported"
        );
      }
      const vary = response.headers.get("vary");
      if (vary !== null && vary.includes("*")) {
        throw new TypeError(
          "Failed to execute 'put' on 'Cache': Vary header contains *"
        );
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
          throw new TypeError(
            "Failed to execute 'put' on 'Cache': Response body is already used"
          );
        }
        throw error;
      }
    }
  }
  __name(Cache2, "Cache");
  const cacheStorage = /* @__PURE__ */ __name((Storage = Map) => {
    const caches2 = new Storage();
    const open = /* @__PURE__ */ __name(async (cacheName) => {
      let cache = caches2.get(cacheName);
      if (cache === void 0) {
        cache = new Cache2(Storage);
        caches2.set(cacheName, cache);
      }
      return cache;
    }, "open");
    const has = /* @__PURE__ */ __name((cacheName) => Promise.resolve(caches2.has(cacheName)), "has");
    const keys = /* @__PURE__ */ __name(() => Promise.resolve(caches2.keys()), "keys");
    const _delete = /* @__PURE__ */ __name((cacheName) => Promise.resolve(caches2.delete(cacheName)), "_delete");
    const match = /* @__PURE__ */ __name(async (request, options) => {
      for (const cache of caches2.values()) {
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
  return { Cache: Cache2, cacheStorage };
}
__name(createCaches, "createCaches");
function Cache() {
  if (!(this instanceof Cache))
    return new Cache();
  throw TypeError("Illegal constructor");
}
__name(Cache, "Cache");
function CacheStorage() {
  if (!(this instanceof CacheStorage))
    return new CacheStorage();
  throw TypeError("Illegal constructor");
}
__name(CacheStorage, "CacheStorage");
var caches = (() => {
  const { cacheStorage } = createCaches();
  const caches2 = cacheStorage();
  caches2.open("default");
  return caches2;
})();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Cache,
  CacheStorage,
  caches,
  createCaches
});
