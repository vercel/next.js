const RUNTIME_PUBLIC_PATH = "output/[turbopack]_runtime.js";
const RELATIVE_ROOT_PATH = "../../../../../../..";
const ASSET_PREFIX = "/";
/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="./runtime-types.d.ts" />
const REEXPORTED_OBJECTS = Symbol("reexported objects");
const hasOwnProperty = Object.prototype.hasOwnProperty;
const toStringTag = typeof Symbol !== "undefined" && Symbol.toStringTag;
function defineProp(obj, name, options) {
    if (!hasOwnProperty.call(obj, name)) Object.defineProperty(obj, name, options);
}
/**
 * Adds the getters to the exports object.
 */ function esm(exports, getters) {
    defineProp(exports, "__esModule", {
        value: true
    });
    if (toStringTag) defineProp(exports, toStringTag, {
        value: "Module"
    });
    for(const key in getters){
        const item = getters[key];
        if (Array.isArray(item)) {
            defineProp(exports, key, {
                get: item[0],
                set: item[1],
                enumerable: true
            });
        } else {
            defineProp(exports, key, {
                get: item,
                enumerable: true
            });
        }
    }
    Object.seal(exports);
}
/**
 * Makes the module an ESM with exports
 */ function esmExport(module, exports, getters) {
    module.namespaceObject = module.exports;
    esm(exports, getters);
}
function ensureDynamicExports(module, exports) {
    let reexportedObjects = module[REEXPORTED_OBJECTS];
    if (!reexportedObjects) {
        reexportedObjects = module[REEXPORTED_OBJECTS] = [];
        module.exports = module.namespaceObject = new Proxy(exports, {
            get (target, prop) {
                if (hasOwnProperty.call(target, prop) || prop === "default" || prop === "__esModule") {
                    return Reflect.get(target, prop);
                }
                for (const obj of reexportedObjects){
                    const value = Reflect.get(obj, prop);
                    if (value !== undefined) return value;
                }
                return undefined;
            },
            ownKeys (target) {
                const keys = Reflect.ownKeys(target);
                for (const obj of reexportedObjects){
                    for (const key of Reflect.ownKeys(obj)){
                        if (key !== "default" && !keys.includes(key)) keys.push(key);
                    }
                }
                return keys;
            }
        });
    }
}
/**
 * Dynamically exports properties from an object
 */ function dynamicExport(module, exports, object) {
    ensureDynamicExports(module, exports);
    if (typeof object === "object" && object !== null) {
        module[REEXPORTED_OBJECTS].push(object);
    }
}
function exportValue(module, value) {
    module.exports = value;
}
function exportNamespace(module, namespace) {
    module.exports = module.namespaceObject = namespace;
}
function createGetter(obj, key) {
    return ()=>obj[key];
}
/**
 * @returns prototype of the object
 */ const getProto = Object.getPrototypeOf ? (obj)=>Object.getPrototypeOf(obj) : (obj)=>obj.__proto__;
/** Prototypes that are not expanded for exports */ const LEAF_PROTOTYPES = [
    null,
    getProto({}),
    getProto([]),
    getProto(getProto)
];
/**
 * @param raw
 * @param ns
 * @param allowExportDefault
 *   * `false`: will have the raw module as default export
 *   * `true`: will have the default property as default export
 */ function interopEsm(raw, ns, allowExportDefault) {
    const getters = Object.create(null);
    for(let current = raw; (typeof current === "object" || typeof current === "function") && !LEAF_PROTOTYPES.includes(current); current = getProto(current)){
        for (const key of Object.getOwnPropertyNames(current)){
            getters[key] = createGetter(raw, key);
        }
    }
    // this is not really correct
    // we should set the `default` getter if the imported module is a `.cjs file`
    if (!(allowExportDefault && "default" in getters)) {
        getters["default"] = ()=>raw;
    }
    esm(ns, getters);
    return ns;
}
function createNS(raw) {
    if (typeof raw === "function") {
        return function(...args) {
            return raw.apply(this, args);
        };
    } else {
        return Object.create(null);
    }
}
function esmImport(sourceModule, id) {
    const module = getOrInstantiateModuleFromParent(id, sourceModule);
    if (module.error) throw module.error;
    // any ES module has to have `module.namespaceObject` defined.
    if (module.namespaceObject) return module.namespaceObject;
    // only ESM can be an async module, so we don't need to worry about exports being a promise here.
    const raw = module.exports;
    return module.namespaceObject = interopEsm(raw, createNS(raw), raw && raw.__esModule);
}
// Add a simple runtime require so that environments without one can still pass
// `typeof require` CommonJS checks so that exports are correctly registered.
const runtimeRequire = // @ts-ignore
typeof require === "function" ? require : function require1() {
    throw new Error("Unexpected use of runtime require");
};
function commonJsRequire(sourceModule, id) {
    const module = getOrInstantiateModuleFromParent(id, sourceModule);
    if (module.error) throw module.error;
    return module.exports;
}
/**
 * `require.context` and require/import expression runtime.
 */ function moduleContext(map) {
    function moduleContext(id) {
        if (hasOwnProperty.call(map, id)) {
            return map[id].module();
        }
        const e = new Error(`Cannot find module '${id}'`);
        e.code = "MODULE_NOT_FOUND";
        throw e;
    }
    moduleContext.keys = ()=>{
        return Object.keys(map);
    };
    moduleContext.resolve = (id)=>{
        if (hasOwnProperty.call(map, id)) {
            return map[id].id();
        }
        const e = new Error(`Cannot find module '${id}'`);
        e.code = "MODULE_NOT_FOUND";
        throw e;
    };
    moduleContext.import = async (id)=>{
        return await moduleContext(id);
    };
    return moduleContext;
}
/**
 * Returns the path of a chunk defined by its data.
 */ function getChunkPath(chunkData) {
    return typeof chunkData === "string" ? chunkData : chunkData.path;
}
function isPromise(maybePromise) {
    return maybePromise != null && typeof maybePromise === "object" && "then" in maybePromise && typeof maybePromise.then === "function";
}
function isAsyncModuleExt(obj) {
    return turbopackQueues in obj;
}
function createPromise() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej)=>{
        reject = rej;
        resolve = res;
    });
    return {
        promise,
        resolve: resolve,
        reject: reject
    };
}
// everything below is adapted from webpack
// https://github.com/webpack/webpack/blob/6be4065ade1e252c1d8dcba4af0f43e32af1bdc1/lib/runtime/AsyncModuleRuntimeModule.js#L13
const turbopackQueues = Symbol("turbopack queues");
const turbopackExports = Symbol("turbopack exports");
const turbopackError = Symbol("turbopack error");
;
function resolveQueue(queue) {
    if (queue && queue.status !== 1) {
        queue.status = 1;
        queue.forEach((fn)=>fn.queueCount--);
        queue.forEach((fn)=>fn.queueCount-- ? fn.queueCount++ : fn());
    }
}
function wrapDeps(deps) {
    return deps.map((dep)=>{
        if (dep !== null && typeof dep === "object") {
            if (isAsyncModuleExt(dep)) return dep;
            if (isPromise(dep)) {
                const queue = Object.assign([], {
                    status: 0
                });
                const obj = {
                    [turbopackExports]: {},
                    [turbopackQueues]: (fn)=>fn(queue)
                };
                dep.then((res)=>{
                    obj[turbopackExports] = res;
                    resolveQueue(queue);
                }, (err)=>{
                    obj[turbopackError] = err;
                    resolveQueue(queue);
                });
                return obj;
            }
        }
        return {
            [turbopackExports]: dep,
            [turbopackQueues]: ()=>{}
        };
    });
}
function asyncModule(module, body, hasAwait) {
    const queue = hasAwait ? Object.assign([], {
        status: -1
    }) : undefined;
    const depQueues = new Set();
    const { resolve, reject, promise: rawPromise } = createPromise();
    const promise = Object.assign(rawPromise, {
        [turbopackExports]: module.exports,
        [turbopackQueues]: (fn)=>{
            queue && fn(queue);
            depQueues.forEach(fn);
            promise["catch"](()=>{});
        }
    });
    const attributes = {
        get () {
            return promise;
        },
        set (v) {
            // Calling `esmExport` leads to this.
            if (v !== promise) {
                promise[turbopackExports] = v;
            }
        }
    };
    Object.defineProperty(module, "exports", attributes);
    Object.defineProperty(module, "namespaceObject", attributes);
    function handleAsyncDependencies(deps) {
        const currentDeps = wrapDeps(deps);
        const getResult = ()=>currentDeps.map((d)=>{
                if (d[turbopackError]) throw d[turbopackError];
                return d[turbopackExports];
            });
        const { promise, resolve } = createPromise();
        const fn = Object.assign(()=>resolve(getResult), {
            queueCount: 0
        });
        function fnQueue(q) {
            if (q !== queue && !depQueues.has(q)) {
                depQueues.add(q);
                if (q && q.status === 0) {
                    fn.queueCount++;
                    q.push(fn);
                }
            }
        }
        currentDeps.map((dep)=>dep[turbopackQueues](fnQueue));
        return fn.queueCount ? promise : getResult();
    }
    function asyncResult(err) {
        if (err) {
            reject(promise[turbopackError] = err);
        } else {
            resolve(promise[turbopackExports]);
        }
        resolveQueue(queue);
    }
    body(handleAsyncDependencies, asyncResult);
    if (queue && queue.status === -1) {
        queue.status = 0;
    }
}
/**
 * A pseudo "fake" URL object to resolve to its relative path.
 *
 * When UrlRewriteBehavior is set to relative, calls to the `new URL()` will construct url without base using this
 * runtime function to generate context-agnostic urls between different rendering context, i.e ssr / client to avoid
 * hydration mismatch.
 *
 * This is based on webpack's existing implementation:
 * https://github.com/webpack/webpack/blob/87660921808566ef3b8796f8df61bd79fc026108/lib/runtime/RelativeUrlRuntimeModule.js
 */ const relativeURL = function relativeURL(inputUrl) {
    const realUrl = new URL(inputUrl, "x:/");
    const values = {};
    for(const key in realUrl)values[key] = realUrl[key];
    values.href = inputUrl;
    values.pathname = inputUrl.replace(/[?#].*/, "");
    values.origin = values.protocol = "";
    values.toString = values.toJSON = (..._args)=>inputUrl;
    for(const key in values)Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        value: values[key]
    });
};
relativeURL.prototype = URL.prototype;
/**
 * Utility function to ensure all variants of an enum are handled.
 */ function invariant(never, computeMessage) {
    throw new Error(`Invariant: ${computeMessage(never)}`);
}
/**
 * A stub function to make `require` available but non-functional in ESM.
 */ function requireStub(_moduleId) {
    throw new Error("dynamic usage of require is not supported");
}
/* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../shared/runtime-utils.ts" />
/// A 'base' utilities to support runtime can have externals.
/// Currently this is for node.js / edge runtime both.
/// If a fn requires node.js specific behavior, it should be placed in `node-external-utils` instead.
async function externalImport(id) {
    let raw;
    try {
        raw = await import(id);
    } catch (err) {
        // TODO(alexkirsz) This can happen when a client-side module tries to load
        // an external module we don't provide a shim for (e.g. querystring, url).
        // For now, we fail semi-silently, but in the future this should be a
        // compilation error.
        throw new Error(`Failed to load external module ${id}: ${err}`);
    }
    if (raw && raw.__esModule && raw.default && 'default' in raw.default) {
        return interopEsm(raw.default, createNS(raw), true);
    }
    return raw;
}
function externalRequire(id, thunk, esm = false) {
    let raw;
    try {
        raw = thunk();
    } catch (err) {
        // TODO(alexkirsz) This can happen when a client-side module tries to load
        // an external module we don't provide a shim for (e.g. querystring, url).
        // For now, we fail semi-silently, but in the future this should be a
        // compilation error.
        throw new Error(`Failed to load external module ${id}: ${err}`);
    }
    if (!esm || raw.__esModule) {
        return raw;
    }
    return interopEsm(raw, createNS(raw), true);
}
externalRequire.resolve = (id, options)=>{
    return require.resolve(id, options);
};
/* eslint-disable @typescript-eslint/no-unused-vars */ const path = require("path");
const relativePathToRuntimeRoot = path.relative(RUNTIME_PUBLIC_PATH, ".");
// Compute the relative path to the `distDir`.
const relativePathToDistRoot = path.join(relativePathToRuntimeRoot, RELATIVE_ROOT_PATH);
const RUNTIME_ROOT = path.resolve(__filename, relativePathToRuntimeRoot);
// Compute the absolute path to the root, by stripping distDir from the absolute path to this file.
const ABSOLUTE_ROOT = path.resolve(__filename, relativePathToDistRoot);
/**
 * Returns an absolute path to the given module path.
 * Module path should be relative, either path to a file or a directory.
 *
 * This fn allows to calculate an absolute path for some global static values, such as
 * `__dirname` or `import.meta.url` that Turbopack will not embeds in compile time.
 * See ImportMetaBinding::code_generation for the usage.
 */ function resolveAbsolutePath(modulePath) {
    if (modulePath) {
        return path.join(ABSOLUTE_ROOT, modulePath);
    }
    return ABSOLUTE_ROOT;
}
/* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../shared/runtime-utils.ts" />
function readWebAssemblyAsResponse(path) {
    const { createReadStream } = require("fs");
    const { Readable } = require("stream");
    const stream = createReadStream(path);
    // @ts-ignore unfortunately there's a slight type mismatch with the stream.
    return new Response(Readable.toWeb(stream), {
        headers: {
            "content-type": "application/wasm"
        }
    });
}
async function compileWebAssemblyFromPath(path) {
    const response = readWebAssemblyAsResponse(path);
    return await WebAssembly.compileStreaming(response);
}
async function instantiateWebAssemblyFromPath(path, importsObj) {
    const response = readWebAssemblyAsResponse(path);
    const { instance } = await WebAssembly.instantiateStreaming(response, importsObj);
    return instance.exports;
}
/* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../shared/runtime-utils.ts" />
/// <reference path="../shared-node/base-externals-utils.ts" />
/// <reference path="../shared-node/node-externals-utils.ts" />
/// <reference path="../shared-node/node-wasm-utils.ts" />
var SourceType = /*#__PURE__*/ function(SourceType) {
    /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   */ SourceType[SourceType["Runtime"] = 0] = "Runtime";
    /**
   * The module was instantiated because a parent module imported it.
   */ SourceType[SourceType["Parent"] = 1] = "Parent";
    return SourceType;
}(SourceType || {});
function stringifySourceInfo(source) {
    switch(source.type){
        case 0:
            return `runtime for chunk ${source.chunkPath}`;
        case 1:
            return `parent module ${source.parentId}`;
        default:
            invariant(source, (source)=>`Unknown source type: ${source?.type}`);
    }
}
const url = require("url");
const fs = require("fs/promises");
const moduleFactories = Object.create(null);
const moduleCache = Object.create(null);
/**
 * Returns an absolute path to the given module's id.
 */ function createResolvePathFromModule(resolver) {
    return function resolvePathFromModule(moduleId) {
        const exported = resolver(moduleId);
        const exportedPath = exported?.default ?? exported;
        if (typeof exportedPath !== "string") {
            return exported;
        }
        const strippedAssetPrefix = exportedPath.slice(ASSET_PREFIX.length);
        const resolved = path.resolve(RUNTIME_ROOT, strippedAssetPrefix);
        return url.pathToFileURL(resolved).href;
    };
}
function loadChunk(chunkData, source) {
    if (typeof chunkData === "string") {
        return loadChunkPath(chunkData, source);
    } else {
        return loadChunkPath(chunkData.path, source);
    }
}
function loadChunkPath(chunkPath, source) {
    if (!chunkPath.endsWith(".js")) {
        // We only support loading JS chunks in Node.js.
        // This branch can be hit when trying to load a CSS chunk.
        return;
    }
    try {
        const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
        const chunkModules = require(resolved);
        for (const [moduleId, moduleFactory] of Object.entries(chunkModules)){
            if (!moduleFactories[moduleId]) {
                moduleFactories[moduleId] = moduleFactory;
            }
        }
    } catch (e) {
        let errorMessage = `Failed to load chunk ${chunkPath}`;
        if (source) {
            errorMessage += ` from ${stringifySourceInfo(source)}`;
        }
        throw new Error(errorMessage, {
            cause: e
        });
    }
}
async function loadChunkAsync(source, chunkData) {
    const chunkPath = typeof chunkData === "string" ? chunkData : chunkData.path;
    if (!chunkPath.endsWith(".js")) {
        // We only support loading JS chunks in Node.js.
        // This branch can be hit when trying to load a CSS chunk.
        return;
    }
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
    try {
        const contents = await fs.readFile(resolved, "utf-8");
        const localRequire = (id)=>{
            let resolvedId = require.resolve(id, {
                paths: [
                    path.dirname(resolved)
                ]
            });
            return require(resolvedId);
        };
        const module1 = {
            exports: {}
        };
        // TODO: Use vm.runInThisContext once our minimal supported Node.js version includes https://github.com/nodejs/node/pull/52153
        // eslint-disable-next-line no-eval -- Can't use vm.runInThisContext due to https://github.com/nodejs/node/issues/52102
        (0, eval)("(function(module, exports, require, __dirname, __filename) {" + contents + "\n})" + "\n//# sourceURL=" + url.pathToFileURL(resolved))(module1, module1.exports, localRequire, path.dirname(resolved), resolved);
        const chunkModules = module1.exports;
        for (const [moduleId, moduleFactory] of Object.entries(chunkModules)){
            if (!moduleFactories[moduleId]) {
                moduleFactories[moduleId] = moduleFactory;
            }
        }
    } catch (e) {
        let errorMessage = `Failed to load chunk ${chunkPath}`;
        if (source) {
            errorMessage += ` from ${stringifySourceInfo(source)}`;
        }
        throw new Error(errorMessage, {
            cause: e
        });
    }
}
function loadWebAssembly(chunkPath, imports) {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
    return instantiateWebAssemblyFromPath(resolved, imports);
}
function loadWebAssemblyModule(chunkPath) {
    const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
    return compileWebAssemblyFromPath(resolved);
}
function getWorkerBlobURL(_chunks) {
    throw new Error("Worker blobs are not implemented yet for Node.js");
}
function instantiateModule(id, source) {
    const moduleFactory = moduleFactories[id];
    if (typeof moduleFactory !== "function") {
        // This can happen if modules incorrectly handle HMR disposes/updates,
        // e.g. when they keep a `setTimeout` around which still executes old code
        // and contains e.g. a `require("something")` call.
        let instantiationReason;
        switch(source.type){
            case 0:
                instantiationReason = `as a runtime entry of chunk ${source.chunkPath}`;
                break;
            case 1:
                instantiationReason = `because it was required from module ${source.parentId}`;
                break;
            default:
                invariant(source, (source)=>`Unknown source type: ${source?.type}`);
        }
        throw new Error(`Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`);
    }
    let parents;
    switch(source.type){
        case 0:
            parents = [];
            break;
        case 1:
            // No need to add this module as a child of the parent module here, this
            // has already been taken care of in `getOrInstantiateModuleFromParent`.
            parents = [
                source.parentId
            ];
            break;
        default:
            invariant(source, (source)=>`Unknown source type: ${source?.type}`);
    }
    const module1 = {
        exports: {},
        error: undefined,
        loaded: false,
        id,
        parents,
        children: [],
        namespaceObject: undefined
    };
    moduleCache[id] = module1;
    // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
    try {
        const r = commonJsRequire.bind(null, module1);
        moduleFactory.call(module1.exports, {
            a: asyncModule.bind(null, module1),
            e: module1.exports,
            r,
            t: runtimeRequire,
            x: externalRequire,
            y: externalImport,
            f: moduleContext,
            i: esmImport.bind(null, module1),
            s: esmExport.bind(null, module1, module1.exports),
            j: dynamicExport.bind(null, module1, module1.exports),
            v: exportValue.bind(null, module1),
            n: exportNamespace.bind(null, module1),
            m: module1,
            c: moduleCache,
            M: moduleFactories,
            l: loadChunkAsync.bind(null, {
                type: 1,
                parentId: id
            }),
            w: loadWebAssembly,
            u: loadWebAssemblyModule,
            g: globalThis,
            P: resolveAbsolutePath,
            U: relativeURL,
            R: createResolvePathFromModule(r),
            b: getWorkerBlobURL,
            z: requireStub,
            __dirname: typeof module1.id === "string" ? module1.id.replace(/(^|\/)\/+$/, "") : module1.id
        });
    } catch (error) {
        module1.error = error;
        throw error;
    }
    module1.loaded = true;
    if (module1.namespaceObject && module1.exports !== module1.namespaceObject) {
        // in case of a circular dependency: cjs1 -> esm2 -> cjs1
        interopEsm(module1.exports, module1.namespaceObject);
    }
    return module1;
}
/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */ // @ts-ignore
function getOrInstantiateModuleFromParent(id, sourceModule) {
    const module1 = moduleCache[id];
    if (sourceModule.children.indexOf(id) === -1) {
        sourceModule.children.push(id);
    }
    if (module1) {
        if (module1.parents.indexOf(sourceModule.id) === -1) {
            module1.parents.push(sourceModule.id);
        }
        return module1;
    }
    return instantiateModule(id, {
        type: 1,
        parentId: sourceModule.id
    });
}
/**
 * Instantiates a runtime module.
 */ function instantiateRuntimeModule(moduleId, chunkPath) {
    return instantiateModule(moduleId, {
        type: 0,
        chunkPath
    });
}
/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */ // @ts-ignore TypeScript doesn't separate this module space from the browser runtime
function getOrInstantiateRuntimeModule(moduleId, chunkPath) {
    const module1 = moduleCache[moduleId];
    if (module1) {
        if (module1.error) {
            throw module1.error;
        }
        return module1;
    }
    return instantiateRuntimeModule(moduleId, chunkPath);
}
module.exports = {
    getOrInstantiateRuntimeModule,
    loadChunk
};
