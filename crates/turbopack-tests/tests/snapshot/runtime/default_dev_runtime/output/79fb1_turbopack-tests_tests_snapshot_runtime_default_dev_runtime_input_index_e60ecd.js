(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([
    "output/79fb1_turbopack-tests_tests_snapshot_runtime_default_dev_runtime_input_index_e60ecd.js",
    {},
    {"otherChunks":[{"path":"output/79fb1_turbopack-tests_tests_snapshot_runtime_default_dev_runtime_input_index_b53fce.js","included":["[project]/crates/turbopack-tests/tests/snapshot/runtime/default_dev_runtime/input/index.js (ecmascript)"]}],"runtimeModuleIds":["[project]/crates/turbopack-tests/tests/snapshot/runtime/default_dev_runtime/input/index.js (ecmascript)"]}
]);
(() => {
if (!Array.isArray(globalThis.TURBOPACK)) {
    return;
}

const CHUNK_BASE_PATH = "";
;
const REEXPORTED_OBJECTS = Symbol("reexported objects");
;
;
;
;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const toStringTag = typeof Symbol !== "undefined" && Symbol.toStringTag;
function defineProp(obj, name, options) {
    if (!hasOwnProperty.call(obj, name)) Object.defineProperty(obj, name, options);
}
function esm(exports, getters) {
    defineProp(exports, "__esModule", {
        value: true
    });
    if (toStringTag) defineProp(exports, toStringTag, {
        value: "Module"
    });
    for(const key in getters){
        defineProp(exports, key, {
            get: getters[key],
            enumerable: true
        });
    }
}
function esmExport(module, getters) {
    esm(module.namespaceObject = module.exports, getters);
}
function dynamicExport(module, object) {
    let reexportedObjects = module[REEXPORTED_OBJECTS];
    if (!reexportedObjects) {
        reexportedObjects = module[REEXPORTED_OBJECTS] = [];
        module.exports = module.namespaceObject = new Proxy(module.exports, {
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
    reexportedObjects.push(object);
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
const getProto = Object.getPrototypeOf ? (obj)=>Object.getPrototypeOf(obj) : (obj)=>obj.__proto__;
const LEAF_PROTOTYPES = [
    null,
    getProto({}),
    getProto([]),
    getProto(getProto)
];
function interopEsm(raw, ns, allowExportDefault) {
    const getters = Object.create(null);
    for(let current = raw; (typeof current === "object" || typeof current === "function") && !LEAF_PROTOTYPES.includes(current); current = getProto(current)){
        for (const key of Object.getOwnPropertyNames(current)){
            getters[key] = createGetter(raw, key);
        }
    }
    if (!(allowExportDefault && "default" in getters)) {
        getters["default"] = ()=>raw;
    }
    esm(ns, getters);
}
function esmImport(sourceModule, id) {
    const module = getOrInstantiateModuleFromParent(id, sourceModule);
    if (module.error) throw module.error;
    if (module.namespaceObject) return module.namespaceObject;
    const raw = module.exports;
    const ns = module.namespaceObject = {};
    interopEsm(raw, ns, raw.__esModule);
    return ns;
}
function commonJsRequire(sourceModule, id) {
    const module = getOrInstantiateModuleFromParent(id, sourceModule);
    if (module.error) throw module.error;
    return module.exports;
}
function requireContext(sourceModule, map) {
    function requireContext(id) {
        const entry = map[id];
        if (!entry) {
            throw new Error(`module ${id} is required from a require.context, but is not in the context`);
        }
        return commonJsRequireContext(entry, sourceModule);
    }
    requireContext.keys = ()=>{
        return Object.keys(map);
    };
    requireContext.resolve = (id)=>{
        const entry = map[id];
        if (!entry) {
            throw new Error(`module ${id} is resolved from a require.context, but is not in the context`);
        }
        return entry.id();
    };
    return requireContext;
}
function getChunkPath(chunkData) {
    return typeof chunkData === "string" ? chunkData : chunkData.path;
}
;
;
;
;
;
;
;
var SourceType;
(function(SourceType) {
    SourceType[SourceType["Runtime"] = 0] = "Runtime";
    SourceType[SourceType["Parent"] = 1] = "Parent";
    SourceType[SourceType["Update"] = 2] = "Update";
})(SourceType || (SourceType = {}));
;
const moduleFactories = Object.create(null);
const moduleCache = Object.create(null);
const moduleHotData = new Map();
const moduleHotState = new Map();
const queuedInvalidatedModules = new Set();
const runtimeModules = new Set();
const moduleChunksMap = new Map();
const chunkModulesMap = new Map();
const runtimeChunkLists = new Set();
const chunkListChunksMap = new Map();
const chunkChunkListsMap = new Map();
const availableModules = new Map();
const availableModuleChunks = new Map();
async function loadChunk(source, chunkData) {
    if (typeof chunkData === "string") {
        return loadChunkPath(source, chunkData);
    }
    const includedList = chunkData.included || [];
    const modulesPromises = includedList.map((included)=>{
        if (moduleFactories[included]) return true;
        return availableModules.get(included);
    });
    if (modulesPromises.length > 0 && modulesPromises.every((p)=>p)) {
        return Promise.all(modulesPromises);
    }
    const includedModuleChunksList = chunkData.moduleChunks || [];
    const moduleChunksPromises = includedModuleChunksList.map((included)=>{
        return availableModuleChunks.get(included);
    }).filter((p)=>p);
    let promise;
    if (moduleChunksPromises.length > 0) {
        if (moduleChunksPromises.length == includedModuleChunksList.length) {
            return Promise.all(moduleChunksPromises);
        }
        const moduleChunksToLoad = new Set();
        for (const moduleChunk of includedModuleChunksList){
            if (!availableModuleChunks.has(moduleChunk)) {
                moduleChunksToLoad.add(moduleChunk);
            }
        }
        for (const moduleChunkToLoad of moduleChunksToLoad){
            const promise = loadChunkPath(source, moduleChunkToLoad);
            availableModuleChunks.set(moduleChunkToLoad, promise);
            moduleChunksPromises.push(promise);
        }
        promise = Promise.all(moduleChunksPromises);
    } else {
        promise = loadChunkPath(source, chunkData.path);
        for (const includedModuleChunk of includedModuleChunksList){
            if (!availableModuleChunks.has(includedModuleChunk)) {
                availableModuleChunks.set(includedModuleChunk, promise);
            }
        }
    }
    for (const included of includedList){
        if (!availableModules.has(included)) {
            availableModules.set(included, promise);
        }
    }
    return promise;
}
async function loadChunkPath(source, chunkPath) {
    try {
        await BACKEND.loadChunk(chunkPath, source);
    } catch (error) {
        let loadReason;
        switch(source.type){
            case SourceType.Runtime:
                loadReason = `as a runtime dependency of chunk ${source.chunkPath}`;
                break;
            case SourceType.Parent:
                loadReason = `from module ${source.parentId}`;
                break;
            case SourceType.Update:
                loadReason = "from an HMR update";
                break;
        }
        throw new Error(`Failed to load chunk ${chunkPath} ${loadReason}${error ? `: ${error}` : ""}`, error ? {
            cause: error
        } : undefined);
    }
}
function instantiateModule(id, source) {
    const moduleFactory = moduleFactories[id];
    if (typeof moduleFactory !== "function") {
        let instantiationReason;
        switch(source.type){
            case SourceType.Runtime:
                instantiationReason = `as a runtime entry of chunk ${source.chunkPath}`;
                break;
            case SourceType.Parent:
                instantiationReason = `because it was required from module ${source.parentId}`;
                break;
            case SourceType.Update:
                instantiationReason = "because of an HMR update";
                break;
        }
        throw new Error(`Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`);
    }
    const hotData = moduleHotData.get(id);
    const { hot, hotState } = createModuleHot(id, hotData);
    let parents;
    switch(source.type){
        case SourceType.Runtime:
            runtimeModules.add(id);
            parents = [];
            break;
        case SourceType.Parent:
            parents = [
                source.parentId
            ];
            break;
        case SourceType.Update:
            parents = source.parents || [];
            break;
    }
    const module = {
        exports: {},
        error: undefined,
        loaded: false,
        id,
        parents,
        children: [],
        namespaceObject: undefined,
        hot
    };
    moduleCache[id] = module;
    moduleHotState.set(module, hotState);
    try {
        runModuleExecutionHooks(module, (refresh)=>{
            moduleFactory.call(module.exports, augmentContext({
                e: module.exports,
                r: commonJsRequire.bind(null, module),
                f: requireContext.bind(null, module),
                i: esmImport.bind(null, module),
                s: esmExport.bind(null, module),
                j: dynamicExport.bind(null, module),
                v: exportValue.bind(null, module),
                n: exportNamespace.bind(null, module),
                m: module,
                c: moduleCache,
                l: loadChunk.bind(null, {
                    type: SourceType.Parent,
                    parentId: id
                }),
                g: globalThis,
                k: refresh,
                __dirname: module.id.replace(/(^|\/)\/+$/, "")
            }));
        });
    } catch (error) {
        module.error = error;
        throw error;
    }
    module.loaded = true;
    if (module.namespaceObject && module.exports !== module.namespaceObject) {
        interopEsm(module.exports, module.namespaceObject);
    }
    return module;
}
function runModuleExecutionHooks(module, executeModule) {
    const cleanupReactRefreshIntercept = typeof globalThis.$RefreshInterceptModuleExecution$ === "function" ? globalThis.$RefreshInterceptModuleExecution$(module.id) : ()=>{};
    try {
        executeModule({
            register: globalThis.$RefreshReg$,
            signature: globalThis.$RefreshSig$
        });
        if ("$RefreshHelpers$" in globalThis) {
            registerExportsAndSetupBoundaryForReactRefresh(module, globalThis.$RefreshHelpers$);
        }
    } catch (e) {
        throw e;
    } finally{
        cleanupReactRefreshIntercept();
    }
}
const getOrInstantiateModuleFromParent = (id, sourceModule)=>{
    if (!sourceModule.hot.active) {
        console.warn(`Unexpected import of module ${id} from module ${sourceModule.id}, which was deleted by an HMR update`);
    }
    const module = moduleCache[id];
    if (sourceModule.children.indexOf(id) === -1) {
        sourceModule.children.push(id);
    }
    if (module) {
        if (module.parents.indexOf(sourceModule.id) === -1) {
            module.parents.push(sourceModule.id);
        }
        return module;
    }
    return instantiateModule(id, {
        type: SourceType.Parent,
        parentId: sourceModule.id
    });
};
function registerExportsAndSetupBoundaryForReactRefresh(module, helpers) {
    const currentExports = module.exports;
    const prevExports = module.hot.data.prevExports ?? null;
    helpers.registerExportsForReactRefresh(currentExports, module.id);
    if (helpers.isReactRefreshBoundary(currentExports)) {
        module.hot.dispose((data)=>{
            data.prevExports = currentExports;
        });
        module.hot.accept();
        if (prevExports !== null) {
            if (helpers.shouldInvalidateReactRefreshBoundary(prevExports, currentExports)) {
                module.hot.invalidate();
            } else {
                helpers.scheduleUpdate();
            }
        }
    } else {
        const isNoLongerABoundary = prevExports !== null;
        if (isNoLongerABoundary) {
            module.hot.invalidate();
        }
    }
}
function formatDependencyChain(dependencyChain) {
    return `Dependency chain: ${dependencyChain.join(" -> ")}`;
}
function computeOutdatedModules(added, modified) {
    const newModuleFactories = new Map();
    for (const [moduleId, entry] of added){
        if (entry != null) {
            newModuleFactories.set(moduleId, _eval(entry));
        }
    }
    const outdatedModules = computedInvalidatedModules(modified.keys());
    for (const [moduleId, entry] of modified){
        newModuleFactories.set(moduleId, _eval(entry));
    }
    return {
        outdatedModules,
        newModuleFactories
    };
}
function computedInvalidatedModules(invalidated) {
    const outdatedModules = new Set();
    for (const moduleId of invalidated){
        const effect = getAffectedModuleEffects(moduleId);
        switch(effect.type){
            case "unaccepted":
                throw new Error(`cannot apply update: unaccepted module. ${formatDependencyChain(effect.dependencyChain)}.`);
            case "self-declined":
                throw new Error(`cannot apply update: self-declined module. ${formatDependencyChain(effect.dependencyChain)}.`);
            case "accepted":
                for (const outdatedModuleId of effect.outdatedModules){
                    outdatedModules.add(outdatedModuleId);
                }
                break;
        }
    }
    return outdatedModules;
}
function computeOutdatedSelfAcceptedModules(outdatedModules) {
    const outdatedSelfAcceptedModules = [];
    for (const moduleId of outdatedModules){
        const module = moduleCache[moduleId];
        const hotState = moduleHotState.get(module);
        if (module && hotState.selfAccepted && !hotState.selfInvalidated) {
            outdatedSelfAcceptedModules.push({
                moduleId,
                errorHandler: hotState.selfAccepted
            });
        }
    }
    return outdatedSelfAcceptedModules;
}
function updateChunksPhase(chunksAddedModules, chunksDeletedModules) {
    for (const [chunkPath, addedModuleIds] of chunksAddedModules){
        for (const moduleId of addedModuleIds){
            addModuleToChunk(moduleId, chunkPath);
        }
    }
    const disposedModules = new Set();
    for (const [chunkPath, addedModuleIds] of chunksDeletedModules){
        for (const moduleId of addedModuleIds){
            if (removeModuleFromChunk(moduleId, chunkPath)) {
                disposedModules.add(moduleId);
            }
        }
    }
    return {
        disposedModules
    };
}
function disposePhase(outdatedModules, disposedModules) {
    for (const moduleId of outdatedModules){
        disposeModule(moduleId, "replace");
    }
    for (const moduleId of disposedModules){
        disposeModule(moduleId, "clear");
    }
    const outdatedModuleParents = new Map();
    for (const moduleId of outdatedModules){
        const oldModule = moduleCache[moduleId];
        outdatedModuleParents.set(moduleId, oldModule?.parents);
        delete moduleCache[moduleId];
    }
    return {
        outdatedModuleParents
    };
}
function disposeModule(moduleId, mode) {
    const module = moduleCache[moduleId];
    if (!module) {
        return;
    }
    const hotState = moduleHotState.get(module);
    const data = {};
    for (const disposeHandler of hotState.disposeHandlers){
        disposeHandler(data);
    }
    module.hot.active = false;
    moduleHotState.delete(module);
    for (const childId of module.children){
        const child = moduleCache[childId];
        if (!child) {
            continue;
        }
        const idx = child.parents.indexOf(module.id);
        if (idx >= 0) {
            child.parents.splice(idx, 1);
        }
    }
    switch(mode){
        case "clear":
            delete moduleCache[module.id];
            moduleHotData.delete(module.id);
            break;
        case "replace":
            moduleHotData.set(module.id, data);
            break;
        default:
            invariant(mode, (mode)=>`invalid mode: ${mode}`);
    }
}
function applyPhase(outdatedSelfAcceptedModules, newModuleFactories, outdatedModuleParents, reportError) {
    for (const [moduleId, factory] of newModuleFactories.entries()){
        moduleFactories[moduleId] = factory;
    }
    for (const { moduleId, errorHandler } of outdatedSelfAcceptedModules){
        try {
            instantiateModule(moduleId, {
                type: SourceType.Update,
                parents: outdatedModuleParents.get(moduleId)
            });
        } catch (err) {
            if (typeof errorHandler === "function") {
                try {
                    errorHandler(err, {
                        moduleId,
                        module: moduleCache[moduleId]
                    });
                } catch (err2) {
                    reportError(err2);
                    reportError(err);
                }
            } else {
                reportError(err);
            }
        }
    }
}
function invariant(never, computeMessage) {
    throw new Error(`Invariant: ${computeMessage(never)}`);
}
function applyUpdate(chunkListPath, update) {
    switch(update.type){
        case "ChunkListUpdate":
            applyChunkListUpdate(chunkListPath, update);
            break;
        default:
            invariant(update, (update)=>`Unknown update type: ${update.type}`);
    }
}
function applyChunkListUpdate(chunkListPath, update) {
    if (update.merged != null) {
        for (const merged of update.merged){
            switch(merged.type){
                case "EcmascriptMergedUpdate":
                    applyEcmascriptMergedUpdate(chunkListPath, merged);
                    break;
                default:
                    invariant(merged, (merged)=>`Unknown merged type: ${merged.type}`);
            }
        }
    }
    if (update.chunks != null) {
        for (const [chunkPath, chunkUpdate] of Object.entries(update.chunks)){
            switch(chunkUpdate.type){
                case "added":
                    BACKEND.loadChunk(chunkPath, {
                        type: SourceType.Update
                    });
                    break;
                case "total":
                    BACKEND.reloadChunk?.(chunkPath);
                    break;
                case "deleted":
                    BACKEND.unloadChunk?.(chunkPath);
                    break;
                case "partial":
                    invariant(chunkUpdate.instruction, (instruction)=>`Unknown partial instruction: ${JSON.stringify(instruction)}.`);
                default:
                    invariant(chunkUpdate, (chunkUpdate)=>`Unknown chunk update type: ${chunkUpdate.type}`);
            }
        }
    }
}
function applyEcmascriptMergedUpdate(chunkPath, update) {
    const { entries = {}, chunks = {} } = update;
    const { added, modified, chunksAdded, chunksDeleted } = computeChangedModules(entries, chunks);
    const { outdatedModules, newModuleFactories } = computeOutdatedModules(added, modified);
    const { disposedModules } = updateChunksPhase(chunksAdded, chunksDeleted);
    applyInternal(outdatedModules, disposedModules, newModuleFactories);
}
function applyInvalidatedModules(outdatedModules) {
    if (queuedInvalidatedModules.size > 0) {
        computedInvalidatedModules(queuedInvalidatedModules).forEach((moduleId)=>{
            outdatedModules.add(moduleId);
        });
        queuedInvalidatedModules.clear();
    }
    return outdatedModules;
}
function applyInternal(outdatedModules, disposedModules, newModuleFactories) {
    outdatedModules = applyInvalidatedModules(outdatedModules);
    const outdatedSelfAcceptedModules = computeOutdatedSelfAcceptedModules(outdatedModules);
    const { outdatedModuleParents } = disposePhase(outdatedModules, disposedModules);
    let error;
    function reportError(err) {
        if (!error) error = err;
    }
    applyPhase(outdatedSelfAcceptedModules, newModuleFactories, outdatedModuleParents, reportError);
    if (error) {
        throw error;
    }
    if (queuedInvalidatedModules.size > 0) {
        applyInternal(new Set(), [], new Map());
    }
}
function computeChangedModules(entries, updates) {
    const chunksAdded = new Map();
    const chunksDeleted = new Map();
    const added = new Map();
    const modified = new Map();
    const deleted = new Set();
    for (const [chunkPath, mergedChunkUpdate] of Object.entries(updates)){
        switch(mergedChunkUpdate.type){
            case "added":
                {
                    const updateAdded = new Set(mergedChunkUpdate.modules);
                    for (const moduleId of updateAdded){
                        added.set(moduleId, entries[moduleId]);
                    }
                    chunksAdded.set(chunkPath, updateAdded);
                    break;
                }
            case "deleted":
                {
                    const updateDeleted = new Set(chunkModulesMap.get(chunkPath));
                    for (const moduleId of updateDeleted){
                        deleted.add(moduleId);
                    }
                    chunksDeleted.set(chunkPath, updateDeleted);
                    break;
                }
            case "partial":
                {
                    const updateAdded = new Set(mergedChunkUpdate.added);
                    const updateDeleted = new Set(mergedChunkUpdate.deleted);
                    for (const moduleId of updateAdded){
                        added.set(moduleId, entries[moduleId]);
                    }
                    for (const moduleId of updateDeleted){
                        deleted.add(moduleId);
                    }
                    chunksAdded.set(chunkPath, updateAdded);
                    chunksDeleted.set(chunkPath, updateDeleted);
                    break;
                }
            default:
                invariant(mergedChunkUpdate, (mergedChunkUpdate)=>`Unknown merged chunk update type: ${mergedChunkUpdate.type}`);
        }
    }
    for (const moduleId of added.keys()){
        if (deleted.has(moduleId)) {
            added.delete(moduleId);
            deleted.delete(moduleId);
        }
    }
    for (const [moduleId, entry] of Object.entries(entries)){
        if (!added.has(moduleId)) {
            modified.set(moduleId, entry);
        }
    }
    return {
        added,
        deleted,
        modified,
        chunksAdded,
        chunksDeleted
    };
}
function getAffectedModuleEffects(moduleId) {
    const outdatedModules = new Set();
    const queue = [
        {
            moduleId,
            dependencyChain: []
        }
    ];
    let nextItem;
    while(nextItem = queue.shift()){
        const { moduleId, dependencyChain } = nextItem;
        if (moduleId != null) {
            outdatedModules.add(moduleId);
        }
        if (moduleId === undefined) {
            return {
                type: "unaccepted",
                dependencyChain
            };
        }
        const module = moduleCache[moduleId];
        const hotState = moduleHotState.get(module);
        if (!module || hotState.selfAccepted && !hotState.selfInvalidated) {
            continue;
        }
        if (hotState.selfDeclined) {
            return {
                type: "self-declined",
                dependencyChain,
                moduleId
            };
        }
        if (runtimeModules.has(moduleId)) {
            queue.push({
                moduleId: undefined,
                dependencyChain: [
                    ...dependencyChain,
                    moduleId
                ]
            });
            continue;
        }
        for (const parentId of module.parents){
            const parent = moduleCache[parentId];
            if (!parent) {
                continue;
            }
            queue.push({
                moduleId: parentId,
                dependencyChain: [
                    ...dependencyChain,
                    moduleId
                ]
            });
        }
    }
    return {
        type: "accepted",
        moduleId,
        outdatedModules
    };
}
function handleApply(chunkListPath, update) {
    switch(update.type){
        case "partial":
            {
                applyUpdate(chunkListPath, update.instruction);
                break;
            }
        case "restart":
            {
                BACKEND.restart();
                break;
            }
        case "notFound":
            {
                if (runtimeChunkLists.has(chunkListPath)) {
                    BACKEND.restart();
                } else {
                    disposeChunkList(chunkListPath);
                }
                break;
            }
        default:
            throw new Error(`Unknown update type: ${update.type}`);
    }
}
function createModuleHot(moduleId, hotData) {
    const hotState = {
        selfAccepted: false,
        selfDeclined: false,
        selfInvalidated: false,
        disposeHandlers: []
    };
    const hot = {
        active: true,
        data: hotData ?? {},
        accept: (modules, _callback, _errorHandler)=>{
            if (modules === undefined) {
                hotState.selfAccepted = true;
            } else if (typeof modules === "function") {
                hotState.selfAccepted = modules;
            } else {
                throw new Error("unsupported `accept` signature");
            }
        },
        decline: (dep)=>{
            if (dep === undefined) {
                hotState.selfDeclined = true;
            } else {
                throw new Error("unsupported `decline` signature");
            }
        },
        dispose: (callback)=>{
            hotState.disposeHandlers.push(callback);
        },
        addDisposeHandler: (callback)=>{
            hotState.disposeHandlers.push(callback);
        },
        removeDisposeHandler: (callback)=>{
            const idx = hotState.disposeHandlers.indexOf(callback);
            if (idx >= 0) {
                hotState.disposeHandlers.splice(idx, 1);
            }
        },
        invalidate: ()=>{
            hotState.selfInvalidated = true;
            queuedInvalidatedModules.add(moduleId);
        },
        status: ()=>"idle",
        addStatusHandler: (_handler)=>{},
        removeStatusHandler: (_handler)=>{}
    };
    return {
        hot,
        hotState
    };
}
function addModuleToChunk(moduleId, chunkPath) {
    let moduleChunks = moduleChunksMap.get(moduleId);
    if (!moduleChunks) {
        moduleChunks = new Set([
            chunkPath
        ]);
        moduleChunksMap.set(moduleId, moduleChunks);
    } else {
        moduleChunks.add(chunkPath);
    }
    let chunkModules = chunkModulesMap.get(chunkPath);
    if (!chunkModules) {
        chunkModules = new Set([
            moduleId
        ]);
        chunkModulesMap.set(chunkPath, chunkModules);
    } else {
        chunkModules.add(moduleId);
    }
}
function getFirstModuleChunk(moduleId) {
    const moduleChunkPaths = moduleChunksMap.get(moduleId);
    if (moduleChunkPaths == null) {
        return null;
    }
    return moduleChunkPaths.values().next().value;
}
function removeModuleFromChunk(moduleId, chunkPath) {
    const moduleChunks = moduleChunksMap.get(moduleId);
    moduleChunks.delete(chunkPath);
    const chunkModules = chunkModulesMap.get(chunkPath);
    chunkModules.delete(moduleId);
    const noRemainingModules = chunkModules.size === 0;
    if (noRemainingModules) {
        chunkModulesMap.delete(chunkPath);
    }
    const noRemainingChunks = moduleChunks.size === 0;
    if (noRemainingChunks) {
        moduleChunksMap.delete(moduleId);
    }
    return noRemainingChunks;
}
function disposeChunkList(chunkListPath) {
    const chunkPaths = chunkListChunksMap.get(chunkListPath);
    if (chunkPaths == null) {
        return false;
    }
    chunkListChunksMap.delete(chunkListPath);
    for (const chunkPath of chunkPaths){
        const chunkChunkLists = chunkChunkListsMap.get(chunkPath);
        chunkChunkLists.delete(chunkListPath);
        if (chunkChunkLists.size === 0) {
            chunkChunkListsMap.delete(chunkPath);
            disposeChunk(chunkPath);
        }
    }
    BACKEND.unloadChunk?.(chunkListPath);
    return true;
}
function disposeChunk(chunkPath) {
    BACKEND.unloadChunk?.(chunkPath);
    const chunkModules = chunkModulesMap.get(chunkPath);
    if (chunkModules == null) {
        return false;
    }
    chunkModules.delete(chunkPath);
    for (const moduleId of chunkModules){
        const moduleChunks = moduleChunksMap.get(moduleId);
        moduleChunks.delete(chunkPath);
        const noRemainingChunks = moduleChunks.size === 0;
        if (noRemainingChunks) {
            moduleChunksMap.delete(moduleId);
            disposeModule(moduleId, "clear");
            availableModules.delete(moduleId);
        }
    }
    return true;
}
function instantiateRuntimeModule(moduleId, chunkPath) {
    return instantiateModule(moduleId, {
        type: SourceType.Runtime,
        chunkPath
    });
}
function getOrInstantiateRuntimeModule(moduleId, chunkPath) {
    const module = moduleCache[moduleId];
    if (module) {
        if (module.error) {
            throw module.error;
        }
        return module;
    }
    return instantiateModule(moduleId, {
        type: SourceType.Runtime,
        chunkPath
    });
}
function getChunkRelativeUrl(chunkPath) {
    return `${CHUNK_BASE_PATH}${chunkPath}`;
}
function registerChunkList(chunkUpdateProvider, chunkList) {
    chunkUpdateProvider.push([
        chunkList.path,
        handleApply.bind(null, chunkList.path)
    ]);
    const chunks = new Set(chunkList.chunks.map(getChunkPath));
    chunkListChunksMap.set(chunkList.path, chunks);
    for (const chunkPath of chunks){
        let chunkChunkLists = chunkChunkListsMap.get(chunkPath);
        if (!chunkChunkLists) {
            chunkChunkLists = new Set([
                chunkList.path
            ]);
            chunkChunkListsMap.set(chunkPath, chunkChunkLists);
        } else {
            chunkChunkLists.add(chunkList.path);
        }
    }
    if (chunkList.source === "entry") {
        markChunkListAsRuntime(chunkList.path);
    }
}
function markChunkListAsRuntime(chunkListPath) {
    runtimeChunkLists.add(chunkListPath);
}
function registerChunk([chunkPath, chunkModules, runtimeParams]) {
    for (const [moduleId, moduleFactory] of Object.entries(chunkModules)){
        if (!moduleFactories[moduleId]) {
            moduleFactories[moduleId] = moduleFactory;
        }
        addModuleToChunk(moduleId, chunkPath);
    }
    return BACKEND.registerChunk(chunkPath, runtimeParams);
}
globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS ??= [];
const chunkListsToRegister = globalThis.TURBOPACK_CHUNK_LISTS;
if (Array.isArray(chunkListsToRegister)) {
    for (const chunkList of chunkListsToRegister){
        registerChunkList(globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS, chunkList);
    }
}
globalThis.TURBOPACK_CHUNK_LISTS = {
    push: (chunkList)=>{
        registerChunkList(globalThis.TURBOPACK_CHUNK_UPDATE_LISTENERS, chunkList);
    }
};
let BACKEND;
function augmentContext(context1) {
    return context1;
}
function commonJsRequireContext(entry1, sourceModule1) {
    return commonJsRequire(sourceModule1, entry1.id());
}
(()=>{
    BACKEND = {
        async registerChunk (chunkPath1, params1) {
            const resolver1 = getOrCreateResolver1(chunkPath1);
            resolver1.resolve();
            if (params1 == null) {
                return;
            }
            for (const otherChunkData1 of params1.otherChunks){
                const otherChunkPath1 = getChunkPath(otherChunkData1);
                getOrCreateResolver1(otherChunkPath1);
            }
            await Promise.all(params1.otherChunks.map((otherChunkData1)=>loadChunk({
                    type: SourceType.Runtime,
                    chunkPath: chunkPath1
                }, otherChunkData1)));
            if (params1.runtimeModuleIds.length > 0) {
                for (const moduleId1 of params1.runtimeModuleIds){
                    getOrInstantiateRuntimeModule(moduleId1, chunkPath1);
                }
            }
        },
        loadChunk (chunkPath1, source1) {
            return doLoadChunk1(chunkPath1, source1);
        },
        unloadChunk (chunkPath1) {
            deleteResolver1(chunkPath1);
            const chunkUrl1 = getChunkRelativeUrl(chunkPath1);
            if (chunkPath1.endsWith(".css")) {
                const links1 = document.querySelectorAll(`link[href="${chunkUrl1}"]`);
                for (const link1 of Array.from(links1)){
                    link1.remove();
                }
            } else if (chunkPath1.endsWith(".js")) {
                const scripts1 = document.querySelectorAll(`script[src="${chunkUrl1}"]`);
                for (const script1 of Array.from(scripts1)){
                    script1.remove();
                }
            } else {
                throw new Error(`can't infer type of chunk from path ${chunkPath1}`);
            }
        },
        reloadChunk (chunkPath1) {
            return new Promise((resolve1, reject1)=>{
                if (!chunkPath1.endsWith(".css")) {
                    reject1(new Error("The DOM backend can only reload CSS chunks"));
                    return;
                }
                const encodedChunkPath1 = chunkPath1.split("/").map((p1)=>encodeURIComponent(p1)).join("/");
                const chunkUrl1 = `/${getChunkRelativeUrl(encodedChunkPath1)}`;
                const previousLink1 = document.querySelector(`link[rel=stylesheet][href^="${chunkUrl1}"]`);
                if (previousLink1 == null) {
                    reject1(new Error(`No link element found for chunk ${chunkPath1}`));
                    return;
                }
                const link1 = document.createElement("link");
                link1.rel = "stylesheet";
                link1.href = chunkUrl1;
                link1.onerror = ()=>{
                    reject1();
                };
                link1.onload = ()=>{
                    previousLink1.remove();
                    resolve1();
                };
                previousLink1.parentElement.insertBefore(link1, previousLink1.nextSibling);
            });
        },
        restart: ()=>self.location.reload()
    };
    const chunkResolvers1 = new Map();
    function getOrCreateResolver1(chunkPath1) {
        let resolver1 = chunkResolvers1.get(chunkPath1);
        if (!resolver1) {
            let resolve1;
            let reject1;
            const promise1 = new Promise((innerResolve1, innerReject1)=>{
                resolve1 = innerResolve1;
                reject1 = innerReject1;
            });
            resolver1 = {
                resolved: false,
                promise: promise1,
                resolve: ()=>{
                    resolver1.resolved = true;
                    resolve1();
                },
                reject: reject1
            };
            chunkResolvers1.set(chunkPath1, resolver1);
        }
        return resolver1;
    }
    function deleteResolver1(chunkPath1) {
        chunkResolvers1.delete(chunkPath1);
    }
    async function doLoadChunk1(chunkPath1, source1) {
        const resolver1 = getOrCreateResolver1(chunkPath1);
        if (resolver1.resolved) {
            return resolver1.promise;
        }
        if (source1.type === SourceType.Runtime) {
            if (chunkPath1.endsWith(".css")) {
                resolver1.resolve();
            }
            return resolver1.promise;
        }
        const chunkUrl1 = `/${getChunkRelativeUrl(chunkPath1)}`;
        if (chunkPath1.endsWith(".css")) {
            const link1 = document.createElement("link");
            link1.rel = "stylesheet";
            link1.href = chunkUrl1;
            link1.onerror = ()=>{
                resolver1.reject();
            };
            link1.onload = ()=>{
                resolver1.resolve();
            };
            document.body.appendChild(link1);
        } else if (chunkPath1.endsWith(".js")) {
            const script1 = document.createElement("script");
            script1.src = chunkUrl1;
            script1.onerror = ()=>{
                resolver1.reject();
            };
            document.body.appendChild(script1);
        } else {
            throw new Error(`can't infer type of chunk from path ${chunkPath1}`);
        }
        return resolver1.promise;
    }
})();
function _eval({ code, url, map }) {
    code += `\n\n//# sourceURL=${location.origin}/${url}`;
    if (map) code += `\n//# sourceMappingURL=${map}`;
    return eval(code);
}
const chunksToRegister = globalThis.TURBOPACK;
globalThis.TURBOPACK = { push: registerChunk };
chunksToRegister.forEach(registerChunk);
})();


//# sourceMappingURL=79fb1_turbopack-tests_tests_snapshot_runtime_default_dev_runtime_input_index_e60ecd.js.map