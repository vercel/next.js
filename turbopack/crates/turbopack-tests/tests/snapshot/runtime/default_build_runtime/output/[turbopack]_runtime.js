const RUNTIME_PUBLIC_PATH = "output/[turbopack]_runtime.js";
const RELATIVE_ROOT_PATH = "../../../../../../..";
const ASSET_PREFIX = "/";
/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="./runtime-types.d.ts" />
const REEXPORTED_OBJECTS = Symbol('reexported objects');
const hasOwnProperty1 = Object.prototype.hasOwnProperty;
const toStringTag2 = typeof Symbol !== 'undefined' && Symbol.toStringTag;
function defineProp3(obj, name1, options2) {
    if (!hasOwnProperty1.call(obj, name1)) Object.defineProperty(obj, name1, options2);
}
function getOverwrittenModule4(moduleCache, id1) {
    let module2 = moduleCache[id1];
    if (!module2) {
        // This is invoked when a module is merged into another module, thus it wasn't invoked via
        // instantiateModule and the cache entry wasn't created yet.
        module2 = {
            exports: {},
            error: undefined,
            loaded: false,
            id: id1,
            namespaceObject: undefined
        };
        moduleCache[id1] = module2;
    }
    return module2;
}
/**
 * Adds the getters to the exports object.
 */ function esm5(exports, getters1) {
    defineProp3(exports, '__esModule', {
        value: true
    });
    if (toStringTag2) defineProp3(exports, toStringTag2, {
        value: 'Module'
    });
    for(const key in getters1){
        const item = getters1[key];
        if (Array.isArray(item)) {
            defineProp3(exports, key, {
                get: item[0],
                set: item[1],
                enumerable: true
            });
        } else {
            defineProp3(exports, key, {
                get: item,
                enumerable: true
            });
        }
    }
    Object.seal(exports);
}
/**
 * Makes the module an ESM with exports
 */ function esmExport6(module, exports1, moduleCache2, getters3, id4) {
    if (id4 != null) {
        module = getOverwrittenModule4(moduleCache2, id4);
        exports1 = module.exports;
    }
    module.namespaceObject = module.exports;
    esm5(exports1, getters3);
}
function ensureDynamicExports7(module, exports1) {
    let reexportedObjects2 = module[REEXPORTED_OBJECTS];
    if (!reexportedObjects2) {
        reexportedObjects2 = module[REEXPORTED_OBJECTS] = [];
        module.exports = module.namespaceObject = new Proxy(exports1, {
            get (target, prop1) {
                if (hasOwnProperty1.call(target, prop1) || prop1 === 'default' || prop1 === '__esModule') {
                    return Reflect.get(target, prop1);
                }
                for (const obj of reexportedObjects2){
                    const value = Reflect.get(obj, prop1);
                    if (value !== undefined) return value;
                }
                return undefined;
            },
            ownKeys (target) {
                const keys1 = Reflect.ownKeys(target);
                for (const obj of reexportedObjects2){
                    for (const key of Reflect.ownKeys(obj)){
                        if (key !== 'default' && !keys1.includes(key)) keys1.push(key);
                    }
                }
                return keys1;
            }
        });
    }
}
/**
 * Dynamically exports properties from an object
 */ function dynamicExport8(module, exports1, moduleCache2, object3, id4) {
    if (id4 != null) {
        module = getOverwrittenModule4(moduleCache2, id4);
        exports1 = module.exports;
    }
    ensureDynamicExports7(module, exports1);
    if (typeof object3 === 'object' && object3 !== null) {
        module[REEXPORTED_OBJECTS].push(object3);
    }
}
function exportValue9(module, moduleCache1, value2, id3) {
    if (id3 != null) {
        module = getOverwrittenModule4(moduleCache1, id3);
    }
    module.exports = value2;
}
function exportNamespace10(module, moduleCache1, namespace2, id3) {
    if (id3 != null) {
        module = getOverwrittenModule4(moduleCache1, id3);
    }
    module.exports = module.namespaceObject = namespace2;
}
function createGetter11(obj, key1) {
    return ()=>obj[key1];
}
/**
 * @returns prototype of the object
 */ const getProto12 = Object.getPrototypeOf ? (obj)=>Object.getPrototypeOf(obj) : (obj)=>obj.__proto__;
/** Prototypes that are not expanded for exports */ const LEAF_PROTOTYPES13 = [
    null,
    getProto12({}),
    getProto12([]),
    getProto12(getProto12)
];
/**
 * @param raw
 * @param ns
 * @param allowExportDefault
 *   * `false`: will have the raw module as default export
 *   * `true`: will have the default property as default export
 */ function interopEsm14(raw, ns1, allowExportDefault2) {
    const getters3 = Object.create(null);
    for(let current = raw; (typeof current === 'object' || typeof current === 'function') && !LEAF_PROTOTYPES13.includes(current); current = getProto12(current)){
        for (const key of Object.getOwnPropertyNames(current)){
            getters3[key] = createGetter11(raw, key);
        }
    }
    // this is not really correct
    // we should set the `default` getter if the imported module is a `.cjs file`
    if (!(allowExportDefault2 && 'default' in getters3)) {
        getters3['default'] = ()=>raw;
    }
    esm5(ns1, getters3);
    return ns1;
}
function createNS15(raw) {
    if (typeof raw === 'function') {
        return function(...args) {
            return raw.apply(this, args);
        };
    } else {
        return Object.create(null);
    }
}
function esmImport16(sourceModule, id1) {
    const module2 = getOrInstantiateModuleFromParent(id1, sourceModule);
    if (module2.error) throw module2.error;
    // any ES module has to have `module.namespaceObject` defined.
    if (module2.namespaceObject) return module2.namespaceObject;
    // only ESM can be an async module, so we don't need to worry about exports being a promise here.
    const raw3 = module2.exports;
    return module2.namespaceObject = interopEsm14(raw3, createNS15(raw3), raw3 && raw3.__esModule);
}
// Add a simple runtime require so that environments without one can still pass
// `typeof require` CommonJS checks so that exports are correctly registered.
const runtimeRequire17 = // @ts-ignore
typeof require === 'function' ? require : function require1() {
    throw new Error('Unexpected use of runtime require');
};
function commonJsRequire18(sourceModule, id1) {
    const module2 = getOrInstantiateModuleFromParent(id1, sourceModule);
    if (module2.error) throw module2.error;
    return module2.exports;
}
/**
 * `require.context` and require/import expression runtime.
 */ function moduleContext19(map) {
    function moduleContext1(id) {
        if (hasOwnProperty1.call(map, id)) {
            return map[id].module();
        }
        const e1 = new Error(`Cannot find module '${id}'`);
        e1.code = 'MODULE_NOT_FOUND';
        throw e1;
    }
    moduleContext1.keys = ()=>{
        return Object.keys(map);
    };
    moduleContext1.resolve = (id)=>{
        if (hasOwnProperty1.call(map, id)) {
            return map[id].id();
        }
        const e1 = new Error(`Cannot find module '${id}'`);
        e1.code = 'MODULE_NOT_FOUND';
        throw e1;
    };
    moduleContext1.import = async (id)=>{
        return await moduleContext1(id);
    };
    return moduleContext1;
}
/**
 * Returns the path of a chunk defined by its data.
 */ function getChunkPath20(chunkData) {
    return typeof chunkData === 'string' ? chunkData : chunkData.path;
}
function isPromise21(maybePromise) {
    return maybePromise != null && typeof maybePromise === 'object' && 'then' in maybePromise && typeof maybePromise.then === 'function';
}
function isAsyncModuleExt22(obj) {
    return turbopackQueues24 in obj;
}
function createPromise23() {
    let resolve;
    let reject1;
    const promise2 = new Promise((res, rej1)=>{
        reject1 = rej1;
        resolve = res;
    });
    return {
        promise: promise2,
        resolve: resolve,
        reject: reject1
    };
}
// everything below is adapted from webpack
// https://github.com/webpack/webpack/blob/6be4065ade1e252c1d8dcba4af0f43e32af1bdc1/lib/runtime/AsyncModuleRuntimeModule.js#L13
const turbopackQueues24 = Symbol('turbopack queues');
const turbopackExports25 = Symbol('turbopack exports');
const turbopackError26 = Symbol('turbopack error');
function resolveQueue27(queue) {
    if (queue && queue.status !== 1) {
        queue.status = 1;
        queue.forEach((fn)=>fn.queueCount--);
        queue.forEach((fn)=>fn.queueCount-- ? fn.queueCount++ : fn());
    }
}
function wrapDeps28(deps) {
    return deps.map((dep)=>{
        if (dep !== null && typeof dep === 'object') {
            if (isAsyncModuleExt22(dep)) return dep;
            if (isPromise21(dep)) {
                const queue = Object.assign([], {
                    status: 0
                });
                const obj1 = {
                    [turbopackExports25]: {},
                    [turbopackQueues24]: (fn)=>fn(queue)
                };
                dep.then((res)=>{
                    obj1[turbopackExports25] = res;
                    resolveQueue27(queue);
                }, (err)=>{
                    obj1[turbopackError26] = err;
                    resolveQueue27(queue);
                });
                return obj1;
            }
        }
        return {
            [turbopackExports25]: dep,
            [turbopackQueues24]: ()=>{}
        };
    });
}
function asyncModule29(module, body1, hasAwait2) {
    const queue3 = hasAwait2 ? Object.assign([], {
        status: -1
    }) : undefined;
    const depQueues4 = new Set();
    const { resolve: resolve5, reject: reject6, promise: rawPromise7 } = createPromise23();
    const promise8 = Object.assign(rawPromise7, {
        [turbopackExports25]: module.exports,
        [turbopackQueues24]: (fn)=>{
            queue3 && fn(queue3);
            depQueues4.forEach(fn);
            promise8['catch'](()=>{});
        }
    });
    const attributes9 = {
        get () {
            return promise8;
        },
        set (v) {
            // Calling `esmExport` leads to this.
            if (v !== promise8) {
                promise8[turbopackExports25] = v;
            }
        }
    };
    Object.defineProperty(module, 'exports', attributes9);
    Object.defineProperty(module, 'namespaceObject', attributes9);
    function handleAsyncDependencies10(deps) {
        const currentDeps1 = wrapDeps28(deps);
        const getResult2 = ()=>currentDeps1.map((d)=>{
                if (d[turbopackError26]) throw d[turbopackError26];
                return d[turbopackExports25];
            });
        const { promise: promise3, resolve: resolve4 } = createPromise23();
        const fn5 = Object.assign(()=>resolve4(getResult2), {
            queueCount: 0
        });
        function fnQueue6(q) {
            if (q !== queue3 && !depQueues4.has(q)) {
                depQueues4.add(q);
                if (q && q.status === 0) {
                    fn5.queueCount++;
                    q.push(fn5);
                }
            }
        }
        currentDeps1.map((dep)=>dep[turbopackQueues24](fnQueue6));
        return fn5.queueCount ? promise3 : getResult2();
    }
    function asyncResult11(err) {
        if (err) {
            reject6(promise8[turbopackError26] = err);
        } else {
            resolve5(promise8[turbopackExports25]);
        }
        resolveQueue27(queue3);
    }
    body1(handleAsyncDependencies10, asyncResult11);
    if (queue3 && queue3.status === -1) {
        queue3.status = 0;
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
 */ const relativeURL30 = function relativeURL(inputUrl) {
    const realUrl1 = new URL(inputUrl, 'x:/');
    const values2 = {};
    for(const key in realUrl1)values2[key] = realUrl1[key];
    values2.href = inputUrl;
    values2.pathname = inputUrl.replace(/[?#].*/, '');
    values2.origin = values2.protocol = '';
    values2.toString = values2.toJSON = (..._args)=>inputUrl;
    for(const key in values2)Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        value: values2[key]
    });
};
relativeURL30.prototype = URL.prototype;
/**
 * Utility function to ensure all variants of an enum are handled.
 */ function invariant31(never, computeMessage1) {
    throw new Error(`Invariant: ${computeMessage1(never)}`);
}
/**
 * A stub function to make `require` available but non-functional in ESM.
 */ function requireStub32(_moduleId) {
    throw new Error('dynamic usage of require is not supported');
}
/* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../shared/runtime-utils.ts" />
/// A 'base' utilities to support runtime can have externals.
/// Currently this is for node.js / edge runtime both.
/// If a fn requires node.js specific behavior, it should be placed in `node-external-utils` instead.
async function externalImport(id) {
    let raw1;
    try {
        raw1 = await import(id);
    } catch (err) {
        // TODO(alexkirsz) This can happen when a client-side module tries to load
        // an external module we don't provide a shim for (e.g. querystring, url).
        // For now, we fail semi-silently, but in the future this should be a
        // compilation error.
        throw new Error(`Failed to load external module ${id}: ${err}`);
    }
    if (raw1 && raw1.__esModule && raw1.default && 'default' in raw1.default) {
        return interopEsm(raw1.default, createNS(raw1), true);
    }
    return raw1;
}
function externalRequire1(id, thunk1, esm2 = false) {
    let raw3;
    try {
        raw3 = thunk1();
    } catch (err) {
        // TODO(alexkirsz) This can happen when a client-side module tries to load
        // an external module we don't provide a shim for (e.g. querystring, url).
        // For now, we fail semi-silently, but in the future this should be a
        // compilation error.
        throw new Error(`Failed to load external module ${id}: ${err}`);
    }
    if (!esm2 || raw3.__esModule) {
        return raw3;
    }
    return interopEsm(raw3, createNS(raw3), true);
}
externalRequire1.resolve = (id, options1)=>{
    return require.resolve(id, options1);
};
/* eslint-disable @typescript-eslint/no-unused-vars */ const path = require('path');
const relativePathToRuntimeRoot1 = path.relative(RUNTIME_PUBLIC_PATH, '.');
// Compute the relative path to the `distDir`.
const relativePathToDistRoot2 = path.join(relativePathToRuntimeRoot1, RELATIVE_ROOT_PATH);
const RUNTIME_ROOT3 = path.resolve(__filename, relativePathToRuntimeRoot1);
// Compute the absolute path to the root, by stripping distDir from the absolute path to this file.
const ABSOLUTE_ROOT4 = path.resolve(__filename, relativePathToDistRoot2);
/**
 * Returns an absolute path to the given module path.
 * Module path should be relative, either path to a file or a directory.
 *
 * This fn allows to calculate an absolute path for some global static values, such as
 * `__dirname` or `import.meta.url` that Turbopack will not embeds in compile time.
 * See ImportMetaBinding::code_generation for the usage.
 */ function resolveAbsolutePath5(modulePath) {
    if (modulePath) {
        return path.join(ABSOLUTE_ROOT4, modulePath);
    }
    return ABSOLUTE_ROOT4;
}
/* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../shared/runtime-utils.ts" />
function readWebAssemblyAsResponse(path) {
    const { createReadStream: createReadStream1 } = require('fs');
    const { Readable: Readable2 } = require('stream');
    const stream3 = createReadStream1(path);
    // @ts-ignore unfortunately there's a slight type mismatch with the stream.
    return new Response(Readable2.toWeb(stream3), {
        headers: {
            'content-type': 'application/wasm'
        }
    });
}
async function compileWebAssemblyFromPath1(path) {
    const response1 = readWebAssemblyAsResponse(path);
    return await WebAssembly.compileStreaming(response1);
}
async function instantiateWebAssemblyFromPath2(path, importsObj1) {
    const response2 = readWebAssemblyAsResponse(path);
    const { instance: instance3 } = await WebAssembly.instantiateStreaming(response2, importsObj1);
    return instance3.exports;
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
process.env.TURBOPACK = '1';
function stringifySourceInfo1(source) {
    switch(source.type){
        case 0:
            return `runtime for chunk ${source.chunkPath}`;
        case 1:
            return `parent module ${source.parentId}`;
        default:
            invariant(source, (source)=>`Unknown source type: ${source?.type}`);
    }
}
const url2 = require('url');
const fs3 = require('fs/promises');
const moduleFactories4 = Object.create(null);
const moduleCache5 = Object.create(null);
/**
 * Returns an absolute path to the given module's id.
 */ function createResolvePathFromModule6(resolver) {
    return function resolvePathFromModule(moduleId) {
        const exported1 = resolver(moduleId);
        const exportedPath2 = exported1?.default ?? exported1;
        if (typeof exportedPath2 !== 'string') {
            return exported1;
        }
        const strippedAssetPrefix3 = exportedPath2.slice(ASSET_PREFIX.length);
        const resolved4 = path.resolve(RUNTIME_ROOT, strippedAssetPrefix3);
        return url2.pathToFileURL(resolved4).href;
    };
}
function loadChunk7(chunkData, source1) {
    if (typeof chunkData === 'string') {
        return loadChunkPath9(chunkData, source1);
    } else {
        return loadChunkPath9(chunkData.path, source1);
    }
}
const loadedChunks8 = new Set();
function loadChunkPath9(chunkPath, source1) {
    if (!isJs20(chunkPath)) {
        // We only support loading JS chunks in Node.js.
        // This branch can be hit when trying to load a CSS chunk.
        return;
    }
    if (loadedChunks8.has(chunkPath)) {
        return;
    }
    try {
        const resolved = path.resolve(RUNTIME_ROOT, chunkPath);
        const chunkModules1 = require(resolved);
        for (const [moduleId, moduleFactory1] of Object.entries(chunkModules1)){
            if (!moduleFactories4[moduleId]) {
                if (Array.isArray(moduleFactory1)) {
                    let [moduleFactoryFn, otherIds1] = moduleFactory1;
                    moduleFactories4[moduleId] = moduleFactoryFn;
                    for (const otherModuleId of otherIds1){
                        moduleFactories4[otherModuleId] = moduleFactoryFn;
                    }
                } else {
                    moduleFactories4[moduleId] = moduleFactory1;
                }
            }
        }
        loadedChunks8.add(chunkPath);
    } catch (e1) {
        let errorMessage = `Failed to load chunk ${chunkPath}`;
        if (source1) {
            errorMessage += ` from ${stringifySourceInfo1(source1)}`;
        }
        throw new Error(errorMessage, {
            cause: e1
        });
    }
}
async function loadChunkAsync10(source, chunkData1) {
    const chunkPath2 = typeof chunkData1 === 'string' ? chunkData1 : chunkData1.path;
    if (!isJs20(chunkPath2)) {
        // We only support loading JS chunks in Node.js.
        // This branch can be hit when trying to load a CSS chunk.
        return;
    }
    if (loadedChunks8.has(chunkPath2)) {
        return;
    }
    const resolved3 = path.resolve(RUNTIME_ROOT, chunkPath2);
    try {
        const contents = await fs3.readFile(resolved3, 'utf-8');
        const localRequire1 = (id)=>{
            let resolvedId1 = require.resolve(id, {
                paths: [
                    path.dirname(resolved3)
                ]
            });
            return require(resolvedId1);
        };
        const module2 = {
            exports: {}
        };
        (0, eval)('(function(module, exports, require, __dirname, __filename) {' + contents + '\n})' + '\n//# sourceURL=' + url2.pathToFileURL(resolved3))(module2, module2.exports, localRequire1, path.dirname(resolved3), resolved3);
        const chunkModules3 = module2.exports;
        for (const [moduleId, moduleFactory1] of Object.entries(chunkModules3)){
            if (!moduleFactories4[moduleId]) {
                if (Array.isArray(moduleFactory1)) {
                    let [moduleFactoryFn, otherIds1] = moduleFactory1;
                    moduleFactories4[moduleId] = moduleFactoryFn;
                    for (const otherModuleId of otherIds1){
                        moduleFactories4[otherModuleId] = moduleFactoryFn;
                    }
                } else {
                    moduleFactories4[moduleId] = moduleFactory1;
                }
            }
        }
        loadedChunks8.add(chunkPath2);
    } catch (e1) {
        let errorMessage = `Failed to load chunk ${chunkPath2}`;
        if (source) {
            errorMessage += ` from ${stringifySourceInfo1(source)}`;
        }
        throw new Error(errorMessage, {
            cause: e1
        });
    }
}
async function loadChunkAsyncByUrl11(source, chunkUrl1) {
    const path2 = url2.fileURLToPath(new URL(chunkUrl1, RUNTIME_ROOT));
    return loadChunkAsync10(source, path2);
}
function loadWebAssembly12(chunkPath, _edgeModule1, imports2) {
    const resolved3 = path.resolve(RUNTIME_ROOT, chunkPath);
    return instantiateWebAssemblyFromPath(resolved3, imports2);
}
function loadWebAssemblyModule13(chunkPath, _edgeModule1) {
    const resolved2 = path.resolve(RUNTIME_ROOT, chunkPath);
    return compileWebAssemblyFromPath(resolved2);
}
function getWorkerBlobURL14(_chunks) {
    throw new Error('Worker blobs are not implemented yet for Node.js');
}
function instantiateModule15(id, source1) {
    const moduleFactory2 = moduleFactories4[id];
    if (typeof moduleFactory2 !== 'function') {
        // This can happen if modules incorrectly handle HMR disposes/updates,
        // e.g. when they keep a `setTimeout` around which still executes old code
        // and contains e.g. a `require("something")` call.
        let instantiationReason;
        switch(source1.type){
            case 0:
                instantiationReason = `as a runtime entry of chunk ${source1.chunkPath}`;
                break;
            case 1:
                instantiationReason = `because it was required from module ${source1.parentId}`;
                break;
            default:
                invariant(source1, (source)=>`Unknown source type: ${source?.type}`);
        }
        throw new Error(`Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`);
    }
    const module3 = {
        exports: {},
        error: undefined,
        loaded: false,
        id,
        namespaceObject: undefined
    };
    moduleCache5[id] = module3;
    // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
    try {
        const r = commonJsRequire.bind(null, module3);
        moduleFactory2.call(module3.exports, {
            a: asyncModule.bind(null, module3),
            e: module3.exports,
            r,
            t: runtimeRequire,
            x: externalRequire,
            y: externalImport,
            f: moduleContext,
            i: esmImport.bind(null, module3),
            s: esmExport.bind(null, module3, module3.exports, moduleCache5),
            j: dynamicExport.bind(null, module3, module3.exports, moduleCache5),
            v: exportValue.bind(null, module3, moduleCache5),
            n: exportNamespace.bind(null, module3, moduleCache5),
            m: module3,
            c: moduleCache5,
            M: moduleFactories4,
            l: loadChunkAsync10.bind(null, {
                type: 1,
                parentId: id
            }),
            L: loadChunkAsyncByUrl11.bind(null, {
                type: 1,
                parentId: id
            }),
            w: loadWebAssembly12,
            u: loadWebAssemblyModule13,
            P: resolveAbsolutePath,
            U: relativeURL,
            R: createResolvePathFromModule6(r),
            b: getWorkerBlobURL14,
            z: requireStub
        });
    } catch (error) {
        module3.error = error;
        throw error;
    }
    module3.loaded = true;
    if (module3.namespaceObject && module3.exports !== module3.namespaceObject) {
        // in case of a circular dependency: cjs1 -> esm2 -> cjs1
        interopEsm(module3.exports, module3.namespaceObject);
    }
    return module3;
}
/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */ // @ts-ignore
function getOrInstantiateModuleFromParent16(id, sourceModule1) {
    const module2 = moduleCache5[id];
    if (module2) {
        return module2;
    }
    return instantiateModule15(id, {
        type: 1,
        parentId: sourceModule1.id
    });
}
/**
 * Instantiates a runtime module.
 */ function instantiateRuntimeModule17(moduleId, chunkPath1) {
    return instantiateModule15(moduleId, {
        type: 0,
        chunkPath: chunkPath1
    });
}
/**
 * Retrieves a module from the cache, or instantiate it as a runtime module if it is not cached.
 */ // @ts-ignore TypeScript doesn't separate this module space from the browser runtime
function getOrInstantiateRuntimeModule18(moduleId, chunkPath1) {
    const module2 = moduleCache5[moduleId];
    if (module2) {
        if (module2.error) {
            throw module2.error;
        }
        return module2;
    }
    return instantiateRuntimeModule17(moduleId, chunkPath1);
}
const regexJsUrl19 = /\.js(?:\?[^#]*)?(?:#.*)?$/;
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */ function isJs20(chunkUrlOrPath) {
    return regexJsUrl19.test(chunkUrlOrPath);
}
module.exports = {
    getOrInstantiateRuntimeModule: getOrInstantiateRuntimeModule18,
    loadChunk: loadChunk7
};