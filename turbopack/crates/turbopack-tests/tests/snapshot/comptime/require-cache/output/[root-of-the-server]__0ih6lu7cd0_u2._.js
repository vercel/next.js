(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["output/[root-of-the-server]__0ih6lu7cd0_u2._.js","[turbopack]/shared/module-cache.ts [test] (ecmascript)",((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cache",
    ()=>cache
]);
'use turbopack: no side effects';
const moduleCache = __turbopack_context__.c;
/**
 * Property keys always reach a `Proxy` trap as strings, but `ModuleId` is
 * `string | number` and the id kind is fixed for a build: either every id is a
 * number or every id is a string. Detect this by testing our own id.
 */ const idsAreNumeric = typeof __turbopack_context__.m.id === 'number';
// Coerce a string object propty to a ModuleId so it can match the cache.
function toKey(key) {
    if (!idsAreNumeric) return key;
    // A non-canonical spelling (`"0123"`, `"1e3"`, `" 1"`) is not any module's
    // id, so leave it as a string: it will simply miss, as it would have against
    // the object cache.  Without this "1x" would coerce to 1 which might match a module, incorrectly
    const numeric = Number(key);
    return String(numeric) === key ? numeric : key;
}
const cache = new Proxy(// Use an empty object as the 'target' so we can implement ownKeys
{}, {
    get (_target, key) {
        if (typeof key !== 'string') return undefined;
        return moduleCache.get(toKey(key));
    },
    set (_target, key, value) {
        if (typeof key !== 'string') return false;
        moduleCache.set(toKey(key), value);
        return true;
    },
    has (_target, key) {
        return typeof key === 'string' && moduleCache.has(toKey(key));
    },
    deleteProperty (_target, key) {
        if (typeof key !== 'string') return false;
        moduleCache.delete(toKey(key));
        return true;
    },
    ownKeys () {
        return Array.from(moduleCache.keys(), String);
    },
    // `ownKeys` alone is not enough: `Object.keys()` filters by enumerability, so
    // it invokes this trap for every key returned above.
    getOwnPropertyDescriptor (_target, key) {
        if (typeof key !== 'string') return undefined;
        const id = toKey(key);
        if (!moduleCache.has(id)) return undefined;
        return {
            value: moduleCache.get(id),
            writable: true,
            enumerable: true,
            configurable: true
        };
    }
});
}),"[project]/turbopack/crates/turbopack-tests/tests/snapshot/comptime/require-cache/input/index.js [test] (ecmascript)",((__turbopack_context__, module, exports) => {

var __TURBOPACK__imported__module__$5b$turbopack$5d2f$shared$2f$module$2d$cache$2e$ts__$5b$test$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[turbopack]/shared/module-cache.ts [test] (ecmascript)");
console.log(__TURBOPACK__imported__module__$5b$turbopack$5d2f$shared$2f$module$2d$cache$2e$ts__$5b$test$5d$__$28$ecmascript$29$__["cache"]);
console.log(("TURBOPACK compile-time value", true));
})]);

//# sourceMappingURL=%5Broot-of-the-server%5D__0ih6lu7cd0_u2._.js.map