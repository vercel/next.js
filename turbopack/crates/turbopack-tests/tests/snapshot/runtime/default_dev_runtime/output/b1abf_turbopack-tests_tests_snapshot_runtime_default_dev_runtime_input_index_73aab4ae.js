(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([
    "output/b1abf_turbopack-tests_tests_snapshot_runtime_default_dev_runtime_input_index_73aab4ae.js",
    {},
    {"otherChunks":["output/b1abf_turbopack-tests_tests_snapshot_runtime_default_dev_runtime_input_index_9cac9e61.js"],"runtimeModuleIds":["[project]/turbopack/crates/turbopack-tests/tests/snapshot/runtime/default_dev_runtime/input/index.js [test] (ecmascript)"]}
]);
(() => {
if (!Array.isArray(globalThis.TURBOPACK)) {
    return;
}

const CHUNK_BASE_PATH = "";
const CHUNK_SUFFIX_PATH = "";
const RELATIVE_ROOT_PATH = "../../../../../../..";
const RUNTIME_PUBLIC_PATH = "";
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
/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *development* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime-utils.ts" />
// Used in WebWorkers to tell the runtime about the chunk base path
var SourceType = /*#__PURE__*/ function(SourceType) {
    /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   */ SourceType[SourceType["Runtime"] = 0] = "Runtime";
    /**
   * The module was instantiated because a parent module imported it.
   */ SourceType[SourceType["Parent"] = 1] = "Parent";
    /**
   * The module was instantiated because it was included in a chunk's hot module
   * update.
   */ SourceType[SourceType["Update"] = 2] = "Update";
    return SourceType;
}(SourceType || {});
const moduleFactories1 = Object.create(null);
/**
 * Module IDs that are instantiated as part of the runtime of a chunk.
 */ const runtimeModules2 = new Set();
/**
 * Map from module ID to the chunks that contain this module.
 *
 * In HMR, we need to keep track of which modules are contained in which so
 * chunks. This is so we don't eagerly dispose of a module when it is removed
 * from chunk A, but still exists in chunk B.
 */ const moduleChunksMap3 = new Map();
/**
 * Map from a chunk path to all modules it contains.
 */ const chunkModulesMap4 = new Map();
/**
 * Chunk lists that contain a runtime. When these chunk lists receive an update
 * that can't be reconciled with the current state of the page, we need to
 * reload the runtime entirely.
 */ const runtimeChunkLists5 = new Set();
/**
 * Map from a chunk list to the chunk paths it contains.
 */ const chunkListChunksMap6 = new Map();
/**
 * Map from a chunk path to the chunk lists it belongs to.
 */ const chunkChunkListsMap7 = new Map();
const availableModules8 = new Map();
const availableModuleChunks9 = new Map();
async function loadChunk10(source, chunkData1) {
    if (typeof chunkData1 === 'string') {
        return loadChunkPath12(source, chunkData1);
    }
    const includedList2 = chunkData1.included || [];
    const modulesPromises3 = includedList2.map((included)=>{
        if (moduleFactories1[included]) return true;
        return availableModules8.get(included);
    });
    if (modulesPromises3.length > 0 && modulesPromises3.every((p)=>p)) {
        // When all included items are already loaded or loading, we can skip loading ourselves
        return Promise.all(modulesPromises3);
    }
    const includedModuleChunksList4 = chunkData1.moduleChunks || [];
    const moduleChunksPromises5 = includedModuleChunksList4.map((included)=>{
        // TODO(alexkirsz) Do we need this check?
        // if (moduleFactories[included]) return true;
        return availableModuleChunks9.get(included);
    }).filter((p)=>p);
    let promise6;
    if (moduleChunksPromises5.length > 0) {
        // Some module chunks are already loaded or loading.
        if (moduleChunksPromises5.length === includedModuleChunksList4.length) {
            // When all included module chunks are already loaded or loading, we can skip loading ourselves
            return Promise.all(moduleChunksPromises5);
        }
        const moduleChunksToLoad = new Set();
        for (const moduleChunk of includedModuleChunksList4){
            if (!availableModuleChunks9.has(moduleChunk)) {
                moduleChunksToLoad.add(moduleChunk);
            }
        }
        for (const moduleChunkToLoad of moduleChunksToLoad){
            const promise = loadChunkPath12(source, moduleChunkToLoad);
            availableModuleChunks9.set(moduleChunkToLoad, promise);
            moduleChunksPromises5.push(promise);
        }
        promise6 = Promise.all(moduleChunksPromises5);
    } else {
        promise6 = loadChunkPath12(source, chunkData1.path);
        // Mark all included module chunks as loading if they are not already loaded or loading.
        for (const includedModuleChunk of includedModuleChunksList4){
            if (!availableModuleChunks9.has(includedModuleChunk)) {
                availableModuleChunks9.set(includedModuleChunk, promise6);
            }
        }
    }
    for (const included of includedList2){
        if (!availableModules8.has(included)) {
            // It might be better to race old and new promises, but it's rare that the new promise will be faster than a request started earlier.
            // In production it's even more rare, because the chunk optimization tries to deduplicate modules anyway.
            availableModules8.set(included, promise6);
        }
    }
    return promise6;
}
async function loadChunkByUrl11(source, chunkUrl1) {
    try {
        await BACKEND.loadChunk(chunkUrl1, source);
    } catch (error1) {
        let loadReason;
        switch(source.type){
            case 0:
                loadReason = `as a runtime dependency of chunk ${source.chunkPath}`;
                break;
            case 1:
                loadReason = `from module ${source.parentId}`;
                break;
            case 2:
                loadReason = 'from an HMR update';
                break;
            default:
                invariant(source, (source)=>`Unknown source type: ${source?.type}`);
        }
        throw new Error(`Failed to load chunk ${chunkUrl1} ${loadReason}${error1 ? `: ${error1}` : ''}`, error1 ? {
            cause: error1
        } : undefined);
    }
}
async function loadChunkPath12(source, chunkPath1) {
    const url2 = getChunkRelativeUrl19(chunkPath1);
    return loadChunkByUrl11(source, url2);
}
/**
 * Returns an absolute url to an asset.
 */ function createResolvePathFromModule13(resolver) {
    return function resolvePathFromModule(moduleId) {
        const exported1 = resolver(moduleId);
        return exported1?.default ?? exported1;
    };
}
/**
 * no-op for browser
 * @param modulePath
 */ function resolveAbsolutePath14(modulePath) {
    return `/ROOT/${modulePath ?? ''}`;
}
/**
 * Returns a blob URL for the worker.
 * @param chunks list of chunks to load
 */ function getWorkerBlobURL15(chunks) {
    // It is important to reverse the array so when bootstrapping we can infer what chunk is being
    // evaluated by poping urls off of this array.  See `getPathFromScript`
    let bootstrap1 = `self.TURBOPACK_WORKER_LOCATION = ${JSON.stringify(location.origin)};
self.TURBOPACK_NEXT_CHUNK_URLS = ${JSON.stringify(chunks.reverse().map(getChunkRelativeUrl19), null, 2)};
importScripts(...self.TURBOPACK_NEXT_CHUNK_URLS.map(c => self.TURBOPACK_WORKER_LOCATION + c).reverse());`;
    let blob2 = new Blob([
        bootstrap1
    ], {
        type: 'text/javascript'
    });
    return URL.createObjectURL(blob2);
}
/**
 * Adds a module to a chunk.
 */ function addModuleToChunk16(moduleId, chunkPath1) {
    let moduleChunks2 = moduleChunksMap3.get(moduleId);
    if (!moduleChunks2) {
        moduleChunks2 = new Set([
            chunkPath1
        ]);
        moduleChunksMap3.set(moduleId, moduleChunks2);
    } else {
        moduleChunks2.add(chunkPath1);
    }
    let chunkModules3 = chunkModulesMap4.get(chunkPath1);
    if (!chunkModules3) {
        chunkModules3 = new Set([
            moduleId
        ]);
        chunkModulesMap4.set(chunkPath1, chunkModules3);
    } else {
        chunkModules3.add(moduleId);
    }
}
/**
 * Returns the first chunk that included a module.
 * This is used by the Node.js backend, hence why it's marked as unused in this
 * file.
 */ function getFirstModuleChunk17(moduleId) {
    const moduleChunkPaths1 = moduleChunksMap3.get(moduleId);
    if (moduleChunkPaths1 == null) {
        return null;
    }
    return moduleChunkPaths1.values().next().value;
}
/**
 * Instantiates a runtime module.
 */ function instantiateRuntimeModule18(moduleId, chunkPath1) {
    return instantiateModule(moduleId, {
        type: 0,
        chunkPath: chunkPath1
    });
}
/**
 * Returns the URL relative to the origin where a chunk can be fetched from.
 */ function getChunkRelativeUrl19(chunkPath) {
    return `${CHUNK_BASE_PATH}${chunkPath.split('/').map((p)=>encodeURIComponent(p)).join('/')}${CHUNK_SUFFIX_PATH}`;
}
function getPathFromScript20(chunkScript) {
    if (typeof chunkScript === 'string') {
        return chunkScript;
    }
    const chunkUrl1 = typeof TURBOPACK_NEXT_CHUNK_URLS !== 'undefined' ? TURBOPACK_NEXT_CHUNK_URLS.pop() : chunkScript.getAttribute('src');
    const src2 = decodeURIComponent(chunkUrl1.replace(/[?#].*$/, ''));
    const path3 = src2.startsWith(CHUNK_BASE_PATH) ? src2.slice(CHUNK_BASE_PATH.length) : src2;
    return path3;
}
/**
 * Marks a chunk list as a runtime chunk list. There can be more than one
 * runtime chunk list. For instance, integration tests can have multiple chunk
 * groups loaded at runtime, each with its own chunk list.
 */ function markChunkListAsRuntime21(chunkListPath) {
    runtimeChunkLists5.add(chunkListPath);
}
function registerChunk22([chunkScript, chunkModules1, runtimeParams2]) {
    const chunkPath3 = getPathFromScript20(chunkScript);
    for (const [moduleId, moduleFactory1] of Object.entries(chunkModules1)){
        if (!moduleFactories1[moduleId]) {
            if (Array.isArray(moduleFactory1)) {
                let [moduleFactoryFn, otherIds1] = moduleFactory1;
                moduleFactories1[moduleId] = moduleFactoryFn;
                for (const otherModuleId of otherIds1){
                    moduleFactories1[otherModuleId] = moduleFactoryFn;
                }
            } else {
                moduleFactories1[moduleId] = moduleFactory1;
            }
        }
        addModuleToChunk16(moduleId, chunkPath3);
    }
    return BACKEND.registerChunk(chunkPath3, runtimeParams2);
}
const regexJsUrl23 = /\.js(?:\?[^#]*)?(?:#.*)?$/;
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */ function isJs24(chunkUrlOrPath) {
    return regexJsUrl23.test(chunkUrlOrPath);
}
const regexCssUrl25 = /\.css(?:\?[^#]*)?(?:#.*)?$/;
/**
 * Checks if a given path/URL ends with .css, optionally followed by ?query or #fragment.
 */ function isCss26(chunkUrl) {
    return regexCssUrl25.test(chunkUrl);
}
/// <reference path="./dev-globals.d.ts" />
/// <reference path="./dev-protocol.d.ts" />
/// <reference path="./dev-extensions.ts" />
/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *development* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ const devModuleCache = Object.create(null);
class UpdateApplyError1 extends Error {
    name = 'UpdateApplyError';
    dependencyChain;
    constructor(message, dependencyChain1){
        super(message);
        this.dependencyChain = dependencyChain1;
    }
}
/**
 * Maps module IDs to persisted data between executions of their hot module
 * implementation (`hot.data`).
 */ const moduleHotData2 = new Map();
/**
 * Maps module instances to their hot module state.
 */ const moduleHotState3 = new Map();
/**
 * Modules that call `module.hot.invalidate()` (while being updated).
 */ const queuedInvalidatedModules4 = new Set();
/**
 * Gets or instantiates a runtime module.
 */ // @ts-ignore
function getOrInstantiateRuntimeModule5(moduleId, chunkPath1) {
    const module2 = devModuleCache[moduleId];
    if (module2) {
        if (module2.error) {
            throw module2.error;
        }
        return module2;
    }
    // @ts-ignore
    return instantiateModule7(moduleId, {
        type: SourceType.Runtime,
        chunkPath: chunkPath1
    });
}
/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */ // @ts-ignore Defined in `runtime-utils.ts`
const getOrInstantiateModuleFromParent6 = (id, sourceModule1)=>{
    if (!sourceModule1.hot.active) {
        console.warn(`Unexpected import of module ${id} from module ${sourceModule1.id}, which was deleted by an HMR update`);
    }
    const module2 = devModuleCache[id];
    if (sourceModule1.children.indexOf(id) === -1) {
        sourceModule1.children.push(id);
    }
    if (module2) {
        if (module2.parents.indexOf(sourceModule1.id) === -1) {
            module2.parents.push(sourceModule1.id);
        }
        return module2;
    }
    return instantiateModule7(id, {
        type: SourceType.Parent,
        parentId: sourceModule1.id
    });
};
function instantiateModule7(moduleId, source1) {
    // We are in development, this is always a string.
    let id2 = moduleId;
    const moduleFactory3 = moduleFactories[id2];
    if (typeof moduleFactory3 !== 'function') {
        // This can happen if modules incorrectly handle HMR disposes/updates,
        // e.g. when they keep a `setTimeout` around which still executes old code
        // and contains e.g. a `require("something")` call.
        let instantiationReason;
        switch(source1.type){
            case SourceType.Runtime:
                instantiationReason = `as a runtime entry of chunk ${source1.chunkPath}`;
                break;
            case SourceType.Parent:
                instantiationReason = `because it was required from module ${source1.parentId}`;
                break;
            case SourceType.Update:
                instantiationReason = 'because of an HMR update';
                break;
            default:
                invariant(source1, (source)=>`Unknown source type: ${source?.type}`);
        }
        throw new Error(`Module ${id2} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`);
    }
    const hotData4 = moduleHotData2.get(id2);
    const { hot: hot5, hotState: hotState6 } = createModuleHot26(id2, hotData4);
    let parents7;
    switch(source1.type){
        case SourceType.Runtime:
            runtimeModules.add(id2);
            parents7 = [];
            break;
        case SourceType.Parent:
            // No need to add this module as a child of the parent module here, this
            // has already been taken care of in `getOrInstantiateModuleFromParent`.
            parents7 = [
                source1.parentId
            ];
            break;
        case SourceType.Update:
            parents7 = source1.parents || [];
            break;
        default:
            invariant(source1, (source)=>`Unknown source type: ${source?.type}`);
    }
    const module8 = {
        exports: {},
        error: undefined,
        loaded: false,
        id: id2,
        parents: parents7,
        children: [],
        namespaceObject: undefined,
        hot: hot5
    };
    devModuleCache[id2] = module8;
    moduleHotState3.set(module8, hotState6);
    // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
    try {
        const sourceInfo = {
            type: SourceType.Parent,
            parentId: id2
        };
        runModuleExecutionHooks8(module8, (refresh)=>{
            const r1 = commonJsRequire.bind(null, module8);
            moduleFactory3(augmentContext({
                a: asyncModule.bind(null, module8),
                e: module8.exports,
                r: commonJsRequire.bind(null, module8),
                t: runtimeRequire,
                f: moduleContext,
                i: esmImport.bind(null, module8),
                s: esmExport.bind(null, module8, module8.exports, devModuleCache),
                j: dynamicExport.bind(null, module8, module8.exports, devModuleCache),
                v: exportValue.bind(null, module8, devModuleCache),
                n: exportNamespace.bind(null, module8, devModuleCache),
                m: module8,
                c: devModuleCache,
                M: moduleFactories,
                l: loadChunk.bind(null, sourceInfo),
                L: loadChunkByUrl.bind(null, sourceInfo),
                w: loadWebAssembly.bind(null, sourceInfo),
                u: loadWebAssemblyModule.bind(null, sourceInfo),
                P: resolveAbsolutePath,
                U: relativeURL,
                k: refresh,
                R: createResolvePathFromModule(r1),
                b: getWorkerBlobURL,
                z: requireStub
            }));
        });
    } catch (error) {
        module8.error = error;
        throw error;
    }
    module8.loaded = true;
    if (module8.namespaceObject && module8.exports !== module8.namespaceObject) {
        // in case of a circular dependency: cjs1 -> esm2 -> cjs1
        interopEsm(module8.exports, module8.namespaceObject);
    }
    return module8;
}
/**
 * NOTE(alexkirsz) Webpack has a "module execution" interception hook that
 * Next.js' React Refresh runtime hooks into to add module context to the
 * refresh registry.
 */ function runModuleExecutionHooks8(module, executeModule1) {
    if (typeof globalThis.$RefreshInterceptModuleExecution$ === 'function') {
        const cleanupReactRefreshIntercept = globalThis.$RefreshInterceptModuleExecution$(module.id);
        try {
            executeModule1({
                register: globalThis.$RefreshReg$,
                signature: globalThis.$RefreshSig$,
                registerExports: registerExportsAndSetupBoundaryForReactRefresh9
            });
        } finally{
            // Always cleanup the intercept, even if module execution failed.
            cleanupReactRefreshIntercept();
        }
    } else {
        // If the react refresh hooks are not installed we need to bind dummy functions.
        // This is expected when running in a Web Worker.  It is also common in some of
        // our test environments.
        executeModule1({
            register: (_type, _id1)=>{},
            signature: ()=>(_type)=>{},
            registerExports: (_module, _helpers1)=>{}
        });
    }
}
/**
 * This is adapted from https://github.com/vercel/next.js/blob/3466862d9dc9c8bb3131712134d38757b918d1c0/packages/react-refresh-utils/internal/ReactRefreshModule.runtime.ts
 */ function registerExportsAndSetupBoundaryForReactRefresh9(module, helpers1) {
    const currentExports2 = module.exports;
    const prevExports3 = module.hot.data.prevExports ?? null;
    helpers1.registerExportsForReactRefresh(currentExports2, module.id);
    // A module can be accepted automatically based on its exports, e.g. when
    // it is a Refresh Boundary.
    if (helpers1.isReactRefreshBoundary(currentExports2)) {
        // Save the previous exports on update, so we can compare the boundary
        // signatures.
        module.hot.dispose((data)=>{
            data.prevExports = currentExports2;
        });
        // Unconditionally accept an update to this module, we'll check if it's
        // still a Refresh Boundary later.
        module.hot.accept();
        // This field is set when the previous version of this module was a
        // Refresh Boundary, letting us know we need to check for invalidation or
        // enqueue an update.
        if (prevExports3 !== null) {
            // A boundary can become ineligible if its exports are incompatible
            // with the previous exports.
            //
            // For example, if you add/remove/change exports, we'll want to
            // re-execute the importing modules, and force those components to
            // re-render. Similarly, if you convert a class component to a
            // function, we want to invalidate the boundary.
            if (helpers1.shouldInvalidateReactRefreshBoundary(helpers1.getRefreshBoundarySignature(prevExports3), helpers1.getRefreshBoundarySignature(currentExports2))) {
                module.hot.invalidate();
            } else {
                helpers1.scheduleUpdate();
            }
        }
    } else {
        // Since we just executed the code for the module, it's possible that the
        // new exports made it ineligible for being a boundary.
        // We only care about the case when we were _previously_ a boundary,
        // because we already accepted this update (accidental side effect).
        const isNoLongerABoundary = prevExports3 !== null;
        if (isNoLongerABoundary) {
            module.hot.invalidate();
        }
    }
}
function formatDependencyChain10(dependencyChain) {
    return `Dependency chain: ${dependencyChain.join(' -> ')}`;
}
function computeOutdatedModules11(added, modified1) {
    const newModuleFactories2 = new Map();
    for (const [moduleId, entry1] of added){
        if (entry1 != null) {
            newModuleFactories2.set(moduleId, _eval(entry1));
        }
    }
    const outdatedModules3 = computedInvalidatedModules12(modified1.keys());
    for (const [moduleId, entry1] of modified1){
        newModuleFactories2.set(moduleId, _eval(entry1));
    }
    return {
        outdatedModules: outdatedModules3,
        newModuleFactories: newModuleFactories2
    };
}
function computedInvalidatedModules12(invalidated) {
    const outdatedModules1 = new Set();
    for (const moduleId of invalidated){
        const effect = getAffectedModuleEffects24(moduleId);
        switch(effect.type){
            case 'unaccepted':
                throw new UpdateApplyError1(`cannot apply update: unaccepted module. ${formatDependencyChain10(effect.dependencyChain)}.`, effect.dependencyChain);
            case 'self-declined':
                throw new UpdateApplyError1(`cannot apply update: self-declined module. ${formatDependencyChain10(effect.dependencyChain)}.`, effect.dependencyChain);
            case 'accepted':
                for (const outdatedModuleId of effect.outdatedModules){
                    outdatedModules1.add(outdatedModuleId);
                }
                break;
            // TODO(alexkirsz) Dependencies: handle dependencies effects.
            default:
                invariant(effect, (effect)=>`Unknown effect type: ${effect?.type}`);
        }
    }
    return outdatedModules1;
}
function computeOutdatedSelfAcceptedModules13(outdatedModules) {
    const outdatedSelfAcceptedModules1 = [];
    for (const moduleId of outdatedModules){
        const module = devModuleCache[moduleId];
        const hotState1 = moduleHotState3.get(module);
        if (module && hotState1.selfAccepted && !hotState1.selfInvalidated) {
            outdatedSelfAcceptedModules1.push({
                moduleId,
                errorHandler: hotState1.selfAccepted
            });
        }
    }
    return outdatedSelfAcceptedModules1;
}
/**
 * Adds, deletes, and moves modules between chunks. This must happen before the
 * dispose phase as it needs to know which modules were removed from all chunks,
 * which we can only compute *after* taking care of added and moved modules.
 */ function updateChunksPhase14(chunksAddedModules, chunksDeletedModules1) {
    for (const [chunkPath, addedModuleIds1] of chunksAddedModules){
        for (const moduleId of addedModuleIds1){
            addModuleToChunk(moduleId, chunkPath);
        }
    }
    const disposedModules2 = new Set();
    for (const [chunkPath, addedModuleIds1] of chunksDeletedModules1){
        for (const moduleId of addedModuleIds1){
            if (removeModuleFromChunk27(moduleId, chunkPath)) {
                disposedModules2.add(moduleId);
            }
        }
    }
    return {
        disposedModules: disposedModules2
    };
}
function disposePhase15(outdatedModules, disposedModules1) {
    for (const moduleId of outdatedModules){
        disposeModule16(moduleId, 'replace');
    }
    for (const moduleId of disposedModules1){
        disposeModule16(moduleId, 'clear');
    }
    // Removing modules from the module cache is a separate step.
    // We also want to keep track of previous parents of the outdated modules.
    const outdatedModuleParents2 = new Map();
    for (const moduleId of outdatedModules){
        const oldModule = devModuleCache[moduleId];
        outdatedModuleParents2.set(moduleId, oldModule?.parents);
        delete devModuleCache[moduleId];
    }
    // TODO(alexkirsz) Dependencies: remove outdated dependency from module
    // children.
    return {
        outdatedModuleParents: outdatedModuleParents2
    };
}
/**
 * Disposes of an instance of a module.
 *
 * Returns the persistent hot data that should be kept for the next module
 * instance.
 *
 * NOTE: mode = "replace" will not remove modules from the devModuleCache
 * This must be done in a separate step afterwards.
 * This is important because all modules need to be disposed to update the
 * parent/child relationships before they are actually removed from the devModuleCache.
 * If this was done in this method, the following disposeModule calls won't find
 * the module from the module id in the cache.
 */ function disposeModule16(moduleId, mode1) {
    const module2 = devModuleCache[moduleId];
    if (!module2) {
        return;
    }
    const hotState3 = moduleHotState3.get(module2);
    const data4 = {};
    // Run the `hot.dispose` handler, if any, passing in the persistent
    // `hot.data` object.
    for (const disposeHandler of hotState3.disposeHandlers){
        disposeHandler(data4);
    }
    // This used to warn in `getOrInstantiateModuleFromParent` when a disposed
    // module is still importing other modules.
    module2.hot.active = false;
    moduleHotState3.delete(module2);
    // TODO(alexkirsz) Dependencies: delete the module from outdated deps.
    // Remove the disposed module from its children's parent list.
    // It will be added back once the module re-instantiates and imports its
    // children again.
    for (const childId of module2.children){
        const child = devModuleCache[childId];
        if (!child) {
            continue;
        }
        const idx1 = child.parents.indexOf(module2.id);
        if (idx1 >= 0) {
            child.parents.splice(idx1, 1);
        }
    }
    switch(mode1){
        case 'clear':
            delete devModuleCache[module2.id];
            moduleHotData2.delete(module2.id);
            break;
        case 'replace':
            moduleHotData2.set(module2.id, data4);
            break;
        default:
            invariant(mode1, (mode)=>`invalid mode: ${mode}`);
    }
}
function applyPhase17(outdatedSelfAcceptedModules, newModuleFactories1, outdatedModuleParents2, reportError3) {
    // Update module factories.
    for (const [moduleId, factory1] of newModuleFactories1.entries()){
        moduleFactories[moduleId] = factory1;
    }
    // TODO(alexkirsz) Run new runtime entries here.
    // TODO(alexkirsz) Dependencies: call accept handlers for outdated deps.
    // Re-instantiate all outdated self-accepted modules.
    for (const { moduleId, errorHandler: errorHandler1 } of outdatedSelfAcceptedModules){
        try {
            instantiateModule7(moduleId, {
                type: SourceType.Update,
                parents: outdatedModuleParents2.get(moduleId)
            });
        } catch (err) {
            if (typeof errorHandler1 === 'function') {
                try {
                    errorHandler1(err, {
                        moduleId,
                        module: devModuleCache[moduleId]
                    });
                } catch (err2) {
                    reportError3(err2);
                    reportError3(err);
                }
            } else {
                reportError3(err);
            }
        }
    }
}
function applyUpdate18(update) {
    switch(update.type){
        case 'ChunkListUpdate':
            applyChunkListUpdate19(update);
            break;
        default:
            invariant(update, (update)=>`Unknown update type: ${update.type}`);
    }
}
function applyChunkListUpdate19(update) {
    if (update.merged != null) {
        for (const merged of update.merged){
            switch(merged.type){
                case 'EcmascriptMergedUpdate':
                    applyEcmascriptMergedUpdate20(merged);
                    break;
                default:
                    invariant(merged, (merged)=>`Unknown merged type: ${merged.type}`);
            }
        }
    }
    if (update.chunks != null) {
        for (const [chunkPath, chunkUpdate1] of Object.entries(update.chunks)){
            const chunkUrl = getChunkRelativeUrl(chunkPath);
            switch(chunkUpdate1.type){
                case 'added':
                    BACKEND.loadChunk(chunkUrl, {
                        type: SourceType.Update
                    });
                    break;
                case 'total':
                    DEV_BACKEND.reloadChunk?.(chunkUrl);
                    break;
                case 'deleted':
                    DEV_BACKEND.unloadChunk?.(chunkUrl);
                    break;
                case 'partial':
                    invariant(chunkUpdate1.instruction, (instruction)=>`Unknown partial instruction: ${JSON.stringify(instruction)}.`);
                    break;
                default:
                    invariant(chunkUpdate1, (chunkUpdate)=>`Unknown chunk update type: ${chunkUpdate.type}`);
            }
        }
    }
}
function applyEcmascriptMergedUpdate20(update) {
    const { entries: entries1 = {}, chunks: chunks2 = {} } = update;
    const { added: added3, modified: modified4, chunksAdded: chunksAdded5, chunksDeleted: chunksDeleted6 } = computeChangedModules23(entries1, chunks2);
    const { outdatedModules: outdatedModules7, newModuleFactories: newModuleFactories8 } = computeOutdatedModules11(added3, modified4);
    const { disposedModules: disposedModules9 } = updateChunksPhase14(chunksAdded5, chunksDeleted6);
    applyInternal22(outdatedModules7, disposedModules9, newModuleFactories8);
}
function applyInvalidatedModules21(outdatedModules) {
    if (queuedInvalidatedModules4.size > 0) {
        computedInvalidatedModules12(queuedInvalidatedModules4).forEach((moduleId)=>{
            outdatedModules.add(moduleId);
        });
        queuedInvalidatedModules4.clear();
    }
    return outdatedModules;
}
function applyInternal22(outdatedModules, disposedModules1, newModuleFactories2) {
    outdatedModules = applyInvalidatedModules21(outdatedModules);
    const outdatedSelfAcceptedModules3 = computeOutdatedSelfAcceptedModules13(outdatedModules);
    const { outdatedModuleParents: outdatedModuleParents4 } = disposePhase15(outdatedModules, disposedModules1);
    // we want to continue on error and only throw the error after we tried applying all updates
    let error5;
    function reportError6(err) {
        if (!error5) error5 = err;
    }
    applyPhase17(outdatedSelfAcceptedModules3, newModuleFactories2, outdatedModuleParents4, reportError6);
    if (error5) {
        throw error5;
    }
    if (queuedInvalidatedModules4.size > 0) {
        applyInternal22(new Set(), [], new Map());
    }
}
function computeChangedModules23(entries, updates1) {
    const chunksAdded2 = new Map();
    const chunksDeleted3 = new Map();
    const added4 = new Map();
    const modified5 = new Map();
    const deleted6 = new Set();
    for (const [chunkPath, mergedChunkUpdate1] of Object.entries(updates1)){
        switch(mergedChunkUpdate1.type){
            case 'added':
                {
                    const updateAdded = new Set(mergedChunkUpdate1.modules);
                    for (const moduleId of updateAdded){
                        added4.set(moduleId, entries[moduleId]);
                    }
                    chunksAdded2.set(chunkPath, updateAdded);
                    break;
                }
            case 'deleted':
                {
                    // We could also use `mergedChunkUpdate.modules` here.
                    const updateDeleted = new Set(chunkModulesMap.get(chunkPath));
                    for (const moduleId of updateDeleted){
                        deleted6.add(moduleId);
                    }
                    chunksDeleted3.set(chunkPath, updateDeleted);
                    break;
                }
            case 'partial':
                {
                    const updateAdded = new Set(mergedChunkUpdate1.added);
                    const updateDeleted1 = new Set(mergedChunkUpdate1.deleted);
                    for (const moduleId of updateAdded){
                        added4.set(moduleId, entries[moduleId]);
                    }
                    for (const moduleId of updateDeleted1){
                        deleted6.add(moduleId);
                    }
                    chunksAdded2.set(chunkPath, updateAdded);
                    chunksDeleted3.set(chunkPath, updateDeleted1);
                    break;
                }
            default:
                invariant(mergedChunkUpdate1, (mergedChunkUpdate)=>`Unknown merged chunk update type: ${mergedChunkUpdate.type}`);
        }
    }
    // If a module was added from one chunk and deleted from another in the same update,
    // consider it to be modified, as it means the module was moved from one chunk to another
    // AND has new code in a single update.
    for (const moduleId of added4.keys()){
        if (deleted6.has(moduleId)) {
            added4.delete(moduleId);
            deleted6.delete(moduleId);
        }
    }
    for (const [moduleId, entry1] of Object.entries(entries)){
        // Modules that haven't been added to any chunk but have new code are considered
        // to be modified.
        // This needs to be under the previous loop, as we need it to get rid of modules
        // that were added and deleted in the same update.
        if (!added4.has(moduleId)) {
            modified5.set(moduleId, entry1);
        }
    }
    return {
        added: added4,
        deleted: deleted6,
        modified: modified5,
        chunksAdded: chunksAdded2,
        chunksDeleted: chunksDeleted3
    };
}
function getAffectedModuleEffects24(moduleId) {
    const outdatedModules1 = new Set();
    const queue2 = [
        {
            moduleId,
            dependencyChain: []
        }
    ];
    let nextItem3;
    while(nextItem3 = queue2.shift()){
        const { moduleId, dependencyChain: dependencyChain1 } = nextItem3;
        if (moduleId != null) {
            if (outdatedModules1.has(moduleId)) {
                continue;
            }
            outdatedModules1.add(moduleId);
        }
        // We've arrived at the runtime of the chunk, which means that nothing
        // else above can accept this update.
        if (moduleId === undefined) {
            return {
                type: 'unaccepted',
                dependencyChain: dependencyChain1
            };
        }
        const module2 = devModuleCache[moduleId];
        const hotState3 = moduleHotState3.get(module2);
        if (// The module is not in the cache. Since this is a "modified" update,
        // it means that the module was never instantiated before.
        !module2 || hotState3.selfAccepted && !hotState3.selfInvalidated) {
            continue;
        }
        if (hotState3.selfDeclined) {
            return {
                type: 'self-declined',
                dependencyChain: dependencyChain1,
                moduleId
            };
        }
        if (runtimeModules.has(moduleId)) {
            queue2.push({
                moduleId: undefined,
                dependencyChain: [
                    ...dependencyChain1,
                    moduleId
                ]
            });
            continue;
        }
        for (const parentId of module2.parents){
            const parent = devModuleCache[parentId];
            if (!parent) {
                continue;
            }
            // TODO(alexkirsz) Dependencies: check accepted and declined
            // dependencies here.
            queue2.push({
                moduleId: parentId,
                dependencyChain: [
                    ...dependencyChain1,
                    moduleId
                ]
            });
        }
    }
    return {
        type: 'accepted',
        moduleId,
        outdatedModules: outdatedModules1
    };
}
function handleApply25(chunkListPath, update1) {
    switch(update1.type){
        case 'partial':
            {
                // This indicates that the update is can be applied to the current state of the application.
                applyUpdate18(update1.instruction);
                break;
            }
        case 'restart':
            {
                // This indicates that there is no way to apply the update to the
                // current state of the application, and that the application must be
                // restarted.
                DEV_BACKEND.restart();
                break;
            }
        case 'notFound':
            {
                // This indicates that the chunk list no longer exists: either the dynamic import which created it was removed,
                // or the page itself was deleted.
                // If it is a dynamic import, we simply discard all modules that the chunk has exclusive access to.
                // If it is a runtime chunk list, we restart the application.
                if (runtimeChunkLists.has(chunkListPath)) {
                    DEV_BACKEND.restart();
                } else {
                    disposeChunkList28(chunkListPath);
                }
                break;
            }
        default:
            throw new Error(`Unknown update type: ${update1.type}`);
    }
}
function createModuleHot26(moduleId, hotData1) {
    const hotState2 = {
        selfAccepted: false,
        selfDeclined: false,
        selfInvalidated: false,
        disposeHandlers: []
    };
    const hot3 = {
        // TODO(alexkirsz) This is not defined in the HMR API. It was used to
        // decide whether to warn whenever an HMR-disposed module required other
        // modules. We might want to remove it.
        active: true,
        data: hotData1 ?? {},
        // TODO(alexkirsz) Support full (dep, callback, errorHandler) form.
        accept: (modules, _callback1, _errorHandler2)=>{
            if (modules === undefined) {
                hotState2.selfAccepted = true;
            } else if (typeof modules === 'function') {
                hotState2.selfAccepted = modules;
            } else {
                throw new Error('unsupported `accept` signature');
            }
        },
        decline: (dep)=>{
            if (dep === undefined) {
                hotState2.selfDeclined = true;
            } else {
                throw new Error('unsupported `decline` signature');
            }
        },
        dispose: (callback)=>{
            hotState2.disposeHandlers.push(callback);
        },
        addDisposeHandler: (callback)=>{
            hotState2.disposeHandlers.push(callback);
        },
        removeDisposeHandler: (callback)=>{
            const idx1 = hotState2.disposeHandlers.indexOf(callback);
            if (idx1 >= 0) {
                hotState2.disposeHandlers.splice(idx1, 1);
            }
        },
        invalidate: ()=>{
            hotState2.selfInvalidated = true;
            queuedInvalidatedModules4.add(moduleId);
        },
        // NOTE(alexkirsz) This is part of the management API, which we don't
        // implement, but the Next.js React Refresh runtime uses this to decide
        // whether to schedule an update.
        status: ()=>'idle',
        // NOTE(alexkirsz) Since we always return "idle" for now, these are no-ops.
        addStatusHandler: (_handler)=>{},
        removeStatusHandler: (_handler)=>{},
        // NOTE(jridgewell) Check returns the list of updated modules, but we don't
        // want the webpack code paths to ever update (the turbopack paths handle
        // this already).
        check: ()=>Promise.resolve(null)
    };
    return {
        hot: hot3,
        hotState: hotState2
    };
}
/**
 * Removes a module from a chunk.
 * Returns `true` if there are no remaining chunks including this module.
 */ function removeModuleFromChunk27(moduleId, chunkPath1) {
    const moduleChunks2 = moduleChunksMap.get(moduleId);
    moduleChunks2.delete(chunkPath1);
    const chunkModules3 = chunkModulesMap.get(chunkPath1);
    chunkModules3.delete(moduleId);
    const noRemainingModules4 = chunkModules3.size === 0;
    if (noRemainingModules4) {
        chunkModulesMap.delete(chunkPath1);
    }
    const noRemainingChunks5 = moduleChunks2.size === 0;
    if (noRemainingChunks5) {
        moduleChunksMap.delete(moduleId);
    }
    return noRemainingChunks5;
}
/**
 * Disposes of a chunk list and its corresponding exclusive chunks.
 */ function disposeChunkList28(chunkListPath) {
    const chunkPaths1 = chunkListChunksMap.get(chunkListPath);
    if (chunkPaths1 == null) {
        return false;
    }
    chunkListChunksMap.delete(chunkListPath);
    for (const chunkPath of chunkPaths1){
        const chunkChunkLists = chunkChunkListsMap.get(chunkPath);
        chunkChunkLists.delete(chunkListPath);
        if (chunkChunkLists.size === 0) {
            chunkChunkListsMap.delete(chunkPath);
            disposeChunk29(chunkPath);
        }
    }
    // We must also dispose of the chunk list's chunk itself to ensure it may
    // be reloaded properly in the future.
    const chunkListUrl2 = getChunkRelativeUrl(chunkListPath);
    DEV_BACKEND.unloadChunk?.(chunkListUrl2);
    return true;
}
/**
 * Disposes of a chunk and its corresponding exclusive modules.
 *
 * @returns Whether the chunk was disposed of.
 */ function disposeChunk29(chunkPath) {
    const chunkUrl1 = getChunkRelativeUrl(chunkPath);
    // This should happen whether the chunk has any modules in it or not.
    // For instance, CSS chunks have no modules in them, but they still need to be unloaded.
    DEV_BACKEND.unloadChunk?.(chunkUrl1);
    const chunkModules2 = chunkModulesMap.get(chunkPath);
    if (chunkModules2 == null) {
        return false;
    }
    chunkModules2.delete(chunkPath);
    for (const moduleId of chunkModules2){
        const moduleChunks = moduleChunksMap.get(moduleId);
        moduleChunks.delete(chunkPath);
        const noRemainingChunks1 = moduleChunks.size === 0;
        if (noRemainingChunks1) {
            moduleChunksMap.delete(moduleId);
            disposeModule16(moduleId, 'clear');
            availableModules.delete(moduleId);
        }
    }
    return true;
}
/**
 * Subscribes to chunk list updates from the update server and applies them.
 */ function registerChunkList30(chunkList) {
    const chunkListScript1 = chunkList.script;
    const chunkListPath2 = getPathFromScript(chunkListScript1);
    // The "chunk" is also registered to finish the loading in the backend
    BACKEND.registerChunk(chunkListPath2);
    globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS.push([
        chunkListPath2,
        handleApply25.bind(null, chunkListPath2)
    ]);
    // Adding chunks to chunk lists and vice versa.
    const chunkPaths3 = new Set(chunkList.chunks.map(getChunkPath));
    chunkListChunksMap.set(chunkListPath2, chunkPaths3);
    for (const chunkPath of chunkPaths3){
        let chunkChunkLists = chunkChunkListsMap.get(chunkPath);
        if (!chunkChunkLists) {
            chunkChunkLists = new Set([
                chunkListPath2
            ]);
            chunkChunkListsMap.set(chunkPath, chunkChunkLists);
        } else {
            chunkChunkLists.add(chunkListPath2);
        }
    }
    if (chunkList.source === 'entry') {
        markChunkListAsRuntime(chunkListPath2);
    }
}
globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS ??= [];
/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime-types.d.ts" />
let BACKEND;
function augmentContext1(context) {
    return context;
}
function fetchWebAssembly2(wasmChunkPath) {
    return fetch(getChunkRelativeUrl(wasmChunkPath));
}
async function loadWebAssembly3(_source, wasmChunkPath1, _edgeModule2, importsObj3) {
    const req4 = fetchWebAssembly2(wasmChunkPath1);
    const { instance: instance5 } = await WebAssembly.instantiateStreaming(req4, importsObj3);
    return instance5.exports;
}
async function loadWebAssemblyModule4(_source, wasmChunkPath1, _edgeModule2) {
    const req3 = fetchWebAssembly2(wasmChunkPath1);
    return await WebAssembly.compileStreaming(req3);
}
/**
 * Maps chunk paths to the corresponding resolver.
 */ const chunkResolvers5 = new Map();
(()=>{
    BACKEND = {
        async registerChunk (chunkPath, params1) {
            const chunkUrl2 = getChunkRelativeUrl(chunkPath);
            const resolver3 = getOrCreateResolver(chunkUrl2);
            resolver3.resolve();
            if (params1 == null) {
                return;
            }
            for (const otherChunkData of params1.otherChunks){
                const otherChunkPath = getChunkPath(otherChunkData);
                const otherChunkUrl1 = getChunkRelativeUrl(otherChunkPath);
                // Chunk might have started loading, so we want to avoid triggering another load.
                getOrCreateResolver(otherChunkUrl1);
            }
            // This waits for chunks to be loaded, but also marks included items as available.
            await Promise.all(params1.otherChunks.map((otherChunkData)=>loadChunk({
                    type: SourceType.Runtime,
                    chunkPath
                }, otherChunkData)));
            if (params1.runtimeModuleIds.length > 0) {
                for (const moduleId of params1.runtimeModuleIds){
                    getOrInstantiateRuntimeModule(moduleId, chunkPath);
                }
            }
        },
        /**
     * Loads the given chunk, and returns a promise that resolves once the chunk
     * has been loaded.
     */ loadChunk (chunkUrl, source1) {
            return doLoadChunk1(chunkUrl, source1);
        }
    };
    function getOrCreateResolver(chunkUrl) {
        let resolver1 = chunkResolvers5.get(chunkUrl);
        if (!resolver1) {
            let resolve;
            let reject1;
            const promise2 = new Promise((innerResolve, innerReject1)=>{
                resolve = innerResolve;
                reject1 = innerReject1;
            });
            resolver1 = {
                resolved: false,
                loadingStarted: false,
                promise: promise2,
                resolve: ()=>{
                    resolver1.resolved = true;
                    resolve();
                },
                reject: reject1
            };
            chunkResolvers5.set(chunkUrl, resolver1);
        }
        return resolver1;
    }
    /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   */ function doLoadChunk1(chunkUrl, source1) {
        const resolver2 = getOrCreateResolver(chunkUrl);
        if (resolver2.loadingStarted) {
            return resolver2.promise;
        }
        if (source1.type === SourceType.Runtime) {
            // We don't need to load chunks references from runtime code, as they're already
            // present in the DOM.
            resolver2.loadingStarted = true;
            if (isCss(chunkUrl)) {
                // CSS chunks do not register themselves, and as such must be marked as
                // loaded instantly.
                resolver2.resolve();
            }
            // We need to wait for JS chunks to register themselves within `registerChunk`
            // before we can start instantiating runtime modules, hence the absence of
            // `resolver.resolve()` in this branch.
            return resolver2.promise;
        }
        if (typeof importScripts === 'function') {
            // We're in a web worker
            if (isCss(chunkUrl)) {
            // ignore
            } else if (isJs(chunkUrl)) {
                self.TURBOPACK_NEXT_CHUNK_URLS.push(chunkUrl);
                importScripts(TURBOPACK_WORKER_LOCATION + chunkUrl);
            } else {
                throw new Error(`can't infer type of chunk from URL ${chunkUrl} in worker`);
            }
        } else {
            // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
            const decodedChunkUrl = decodeURI(chunkUrl);
            if (isCss(chunkUrl)) {
                const previousLinks = document.querySelectorAll(`link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl}"],link[rel=stylesheet][href^="${decodedChunkUrl}?"]`);
                if (previousLinks.length > 0) {
                    // CSS chunks do not register themselves, and as such must be marked as
                    // loaded instantly.
                    resolver2.resolve();
                } else {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = chunkUrl;
                    link.onerror = ()=>{
                        resolver2.reject();
                    };
                    link.onload = ()=>{
                        // CSS chunks do not register themselves, and as such must be marked as
                        // loaded instantly.
                        resolver2.resolve();
                    };
                    document.body.appendChild(link);
                }
            } else if (isJs(chunkUrl)) {
                const previousScripts = document.querySelectorAll(`script[src="${chunkUrl}"],script[src^="${chunkUrl}?"],script[src="${decodedChunkUrl}"],script[src^="${decodedChunkUrl}?"]`);
                if (previousScripts.length > 0) {
                    // There is this edge where the script already failed loading, but we
                    // can't detect that. The Promise will never resolve in this case.
                    for (const script of Array.from(previousScripts)){
                        script.addEventListener('error', ()=>{
                            resolver2.reject();
                        });
                    }
                } else {
                    const script = document.createElement('script');
                    script.src = chunkUrl;
                    // We'll only mark the chunk as loaded once the script has been executed,
                    // which happens in `registerChunk`. Hence the absence of `resolve()` in
                    // this branch.
                    script.onerror = ()=>{
                        resolver2.reject();
                    };
                    document.body.appendChild(script);
                }
            } else {
                throw new Error(`can't infer type of chunk from URL ${chunkUrl}`);
            }
        }
        resolver2.loadingStarted = true;
        return resolver2.promise;
    }
})();
/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../base/runtime-base.ts" />
/// <reference path="../base/dev-base.ts" />
/// <reference path="./runtime-backend-dom.ts" />
/// <reference path="../../../shared/require-type.d.ts" />
let DEV_BACKEND;
(()=>{
    DEV_BACKEND = {
        unloadChunk (chunkUrl) {
            deleteResolver(chunkUrl);
            // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
            const decodedChunkUrl1 = decodeURI(chunkUrl);
            if (isCss(chunkUrl)) {
                const links = document.querySelectorAll(`link[href="${chunkUrl}"],link[href^="${chunkUrl}?"],link[href="${decodedChunkUrl1}"],link[href^="${decodedChunkUrl1}?"]`);
                for (const link of Array.from(links)){
                    link.remove();
                }
            } else if (isJs(chunkUrl)) {
                // Unloading a JS chunk would have no effect, as it lives in the JS
                // runtime once evaluated.
                // However, we still want to remove the script tag from the DOM to keep
                // the HTML somewhat consistent from the user's perspective.
                const scripts = document.querySelectorAll(`script[src="${chunkUrl}"],script[src^="${chunkUrl}?"],script[src="${decodedChunkUrl1}"],script[src^="${decodedChunkUrl1}?"]`);
                for (const script of Array.from(scripts)){
                    script.remove();
                }
            } else {
                throw new Error(`can't infer type of chunk from URL ${chunkUrl}`);
            }
        },
        reloadChunk (chunkUrl) {
            return new Promise((resolve, reject1)=>{
                if (!isCss(chunkUrl)) {
                    reject1(new Error('The DOM backend can only reload CSS chunks'));
                    return;
                }
                const decodedChunkUrl2 = decodeURI(chunkUrl);
                const previousLinks3 = document.querySelectorAll(`link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl2}"],link[rel=stylesheet][href^="${decodedChunkUrl2}?"]`);
                if (previousLinks3.length === 0) {
                    reject1(new Error(`No link element found for chunk ${chunkUrl}`));
                    return;
                }
                const link4 = document.createElement('link');
                link4.rel = 'stylesheet';
                if (navigator.userAgent.includes('Firefox')) {
                    // Firefox won't reload CSS files that were previously loaded on the current page,
                    // we need to add a query param to make sure CSS is actually reloaded from the server.
                    //
                    // I believe this is this issue: https://bugzilla.mozilla.org/show_bug.cgi?id=1037506
                    //
                    // Safari has a similar issue, but only if you have a `<link rel=preload ... />` tag
                    // pointing to the same URL as the stylesheet: https://bugs.webkit.org/show_bug.cgi?id=187726
                    link4.href = `${chunkUrl}?ts=${Date.now()}`;
                } else {
                    link4.href = chunkUrl;
                }
                link4.onerror = ()=>{
                    reject1();
                };
                link4.onload = ()=>{
                    // First load the new CSS, then remove the old ones. This prevents visible
                    // flickering that would happen in-between removing the previous CSS and
                    // loading the new one.
                    for (const previousLink of Array.from(previousLinks3))previousLink.remove();
                    // CSS chunks do not register themselves, and as such must be marked as
                    // loaded instantly.
                    resolve();
                };
                // Make sure to insert the new CSS right after the previous one, so that
                // its precedence is higher.
                previousLinks3[0].parentElement.insertBefore(link4, previousLinks3[0].nextSibling);
            });
        },
        restart: ()=>self.location.reload()
    };
    function deleteResolver(chunkUrl) {
        chunkResolvers.delete(chunkUrl);
    }
})();
function _eval({ code, url, map }) {
    code += `\n\n//# sourceURL=${encodeURI(location.origin + CHUNK_BASE_PATH + url + CHUNK_SUFFIX_PATH)}`;
    if (map) {
        code += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${btoa(// btoa doesn't handle nonlatin characters, so escape them as \x sequences
        // See https://stackoverflow.com/a/26603875
        unescape(encodeURIComponent(map)))}`;
    }
    // eslint-disable-next-line no-eval
    return eval(code);
}
const chunksToRegister = globalThis.TURBOPACK;
globalThis.TURBOPACK = { push: registerChunk };
chunksToRegister.forEach(registerChunk);
const chunkListsToRegister = globalThis.TURBOPACK_CHUNK_LISTS || [];
chunkListsToRegister.forEach(registerChunkList);
globalThis.TURBOPACK_CHUNK_LISTS = { push: registerChunkList };
})();


//# sourceMappingURL=b1abf_turbopack-tests_tests_snapshot_runtime_default_dev_runtime_input_index_73aab4ae.js.map