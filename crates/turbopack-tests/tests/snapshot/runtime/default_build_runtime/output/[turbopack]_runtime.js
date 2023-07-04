const RUNTIME_PUBLIC_PATH = "output/[turbopack]_runtime.js";
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
        module.namespaceObject = new Proxy(module.exports, {
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
var SourceType;
(function(SourceType) {
    SourceType[SourceType["Runtime"] = 0] = "Runtime";
    SourceType[SourceType["Parent"] = 1] = "Parent";
})(SourceType || (SourceType = {}));
;
;
const path = require("path");
const relativePathToRuntimeRoot = path.relative(RUNTIME_PUBLIC_PATH, ".");
const RUNTIME_ROOT = path.resolve(__filename, relativePathToRuntimeRoot);
const moduleFactories = Object.create(null);
const moduleCache = Object.create(null);
function commonJsRequireContext(entry, sourceModule) {
    return entry.external ? externalRequire(entry.id(), false) : commonJsRequire(sourceModule, entry.id());
}
function externalRequire(id, esm1 = false) {
    let raw;
    try {
        raw = require(id);
    } catch (err) {
        throw new Error(`Failed to load external module ${id}: ${err}`);
    }
    if (!esm1 || raw.__esModule) {
        return raw;
    }
    const ns = {};
    interopEsm(raw, ns, true);
    return ns;
}
externalRequire.resolve = (id, options)=>{
    return require.resolve(id, options);
};
function loadChunk(chunkPath) {
    if (!chunkPath.endsWith(".js")) {
        return;
    }
    const resolved = require.resolve(path.resolve(RUNTIME_ROOT, chunkPath));
    delete require.cache[resolved];
    const chunkModules = require(resolved);
    for (const [moduleId, moduleFactory] of Object.entries(chunkModules)){
        if (!moduleFactories[moduleId]) {
            moduleFactories[moduleId] = moduleFactory;
        }
    }
}
function loadChunkAsync(source, chunkPath) {
    return new Promise((resolve, reject)=>{
        try {
            loadChunk(chunkPath);
        } catch (err) {
            reject(err);
            return;
        }
        resolve();
    });
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
        }
        throw new Error(`Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`);
    }
    let parents;
    switch(source.type){
        case SourceType.Runtime:
            parents = [];
            break;
        case SourceType.Parent:
            parents = [
                source.parentId
            ];
            break;
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
    try {
        moduleFactory.call(module1.exports, {
            e: module1.exports,
            r: commonJsRequire.bind(null, module1),
            x: externalRequire,
            f: requireContext.bind(null, module1),
            i: esmImport.bind(null, module1),
            s: esm.bind(null, module1.exports),
            j: dynamicExport.bind(null, module1),
            v: exportValue.bind(null, module1),
            n: exportNamespace.bind(null, module1),
            m: module1,
            c: moduleCache,
            l: loadChunkAsync.bind(null, {
                type: SourceType.Parent,
                parentId: id
            }),
            g: globalThis,
            __dirname: module1.id.replace(/(^|\/)[\/]+$/, "")
        });
    } catch (error) {
        module1.error = error;
        throw error;
    }
    module1.loaded = true;
    if (module1.namespaceObject && module1.exports !== module1.namespaceObject) {
        interopEsm(module1.exports, module1.namespaceObject);
    }
    return module1;
}
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
        type: SourceType.Parent,
        parentId: sourceModule.id
    });
}
function instantiateRuntimeModule(moduleId, chunkPath) {
    return instantiateModule(moduleId, {
        type: SourceType.Runtime,
        chunkPath
    });
}
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