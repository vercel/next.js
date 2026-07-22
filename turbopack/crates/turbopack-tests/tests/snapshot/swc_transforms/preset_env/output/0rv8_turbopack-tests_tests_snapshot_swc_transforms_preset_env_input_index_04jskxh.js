(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([
    "output/0rv8_turbopack-tests_tests_snapshot_swc_transforms_preset_env_input_index_04jskxh.js",
    {"otherChunks":["output/turbopack_crates_turbopack-tests_tests_snapshot_1v9rcb0._.js"],"runtimeModuleIds":["[project]/turbopack/crates/turbopack-tests/tests/snapshot/swc_transforms/preset_env/input/index.js [test] (ecmascript)"]}
]);
(function(){
if (!Array.isArray(globalThis["TURBOPACK"])) {
    return;
}

var CHUNK_BASE_PATH = "";
var RELATIVE_ROOT_PATH = "../../../../../../..";
var RUNTIME_PUBLIC_PATH = "";
const SUPPORT_COMPONENT_CHUNKS = false;
var ASSET_SUFFIX = "";
var CROSS_ORIGIN = null;
var CHUNK_LOAD_RETRY_MAX_ATTEMPTS = 1;
var CHUNK_LOAD_RETRY_BASE_DELAY_MS = 200;
var CHUNK_LOAD_RETRY_MAX_JITTER_MS = 400;
/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="./runtime-types.d.ts" />
/// <reference path="./async-module.ts" />
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _type_of(obj) {
    "@swc/helpers - typeof";
    return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj;
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
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
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
/**
 * Describes why a module was instantiated.
 * Shared between browser and Node.js runtimes.
 */ var SourceType = /*#__PURE__*/ function(SourceType) {
    /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   * SourceData is a ChunkPath.
   */ SourceType[SourceType["Runtime"] = 0] = "Runtime";
    /**
   * The module was instantiated because a parent module imported it.
   * SourceData is a ModuleId.
   */ SourceType[SourceType["Parent"] = 1] = "Parent";
    /**
   * The module was instantiated because it was included in a chunk's hot module
   * update.
   * SourceData is an array of ModuleIds or undefined.
   */ SourceType[SourceType["Update"] = 2] = "Update";
    return SourceType;
}(SourceType || {});
/**
 * Flag indicating which module object type to create when a module is merged. Set to `true`
 * by each runtime that uses ModuleWithDirection (browser dev-base.ts, nodejs dev-base.ts,
 * nodejs build-base.ts). Browser production (build-base.ts) leaves it as `false` since it
 * uses plain Module objects.
 */ var createModuleWithDirectionFlag = false;
var REEXPORTED_OBJECTS = new WeakMap();
/**
 * Constructs the `__turbopack_context__` object for a module.
 */ function Context(module, exports) {
    this.m = module;
    // We need to store this here instead of accessing it from the module object to:
    // 1. Make it available to factories directly, since we rewrite `this` to
    //    `__turbopack_context__.e` in CJS modules.
    // 2. Support async modules which rewrite `module.exports` to a promise, so we
    //    can still access the original exports object from functions like
    //    `esmExport`
    // Ideally we could find a new approach for async modules and drop this property altogether.
    this.e = exports;
}
var contextPrototype = Context.prototype;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var toStringTag = typeof Symbol !== 'undefined' && Symbol.toStringTag;
function defineProp(obj, name, options) {
    if (!hasOwnProperty.call(obj, name)) Object.defineProperty(obj, name, options);
}
function getOverwrittenModule(moduleCache, id) {
    var module = moduleCache[id];
    if (!module) {
        if (createModuleWithDirectionFlag) {
            // set in development modes for hmr support
            module = createModuleWithDirection(id);
        } else {
            module = createModuleObject(id);
        }
        moduleCache[id] = module;
    }
    return module;
}
/**
 * Creates the module object. Only done here to ensure all module objects have the same shape.
 */ function createModuleObject(id) {
    return {
        exports: {},
        error: undefined,
        id: id,
        namespaceObject: undefined
    };
}
function createModuleWithDirection(id) {
    return {
        exports: {},
        error: undefined,
        id: id,
        namespaceObject: undefined,
        parents: [],
        children: []
    };
}
var BindingTag_Value = 0;
/**
 * Adds the getters to the exports object.
 */ function esm(exports, bindings, dynamic) {
    defineProp(exports, '__esModule', {
        value: true
    });
    if (toStringTag) defineProp(exports, toStringTag, {
        value: 'Module'
    });
    var i = 0;
    while(i < bindings.length){
        var propName = bindings[i++];
        var tagOrFunction = bindings[i++];
        if (typeof tagOrFunction === 'number') {
            if (tagOrFunction === BindingTag_Value) {
                defineProp(exports, propName, {
                    value: bindings[i++],
                    enumerable: true,
                    writable: false
                });
            } else {
                throw new Error(`unexpected tag: ${tagOrFunction}`);
            }
        } else {
            var getterFn = tagOrFunction;
            if (typeof bindings[i] === 'function') {
                var setterFn = bindings[i++];
                defineProp(exports, propName, {
                    get: getterFn,
                    set: setterFn,
                    enumerable: true
                });
            } else {
                defineProp(exports, propName, {
                    get: getterFn,
                    enumerable: true
                });
            }
        }
    }
    // The properties defined above are already non-configurable and
    // non-writable, so the namespace's existing exports are effectively
    // immutable. Sealing additionally makes the object non-extensible, matching
    // real ESM-namespace semantics. Modules with dynamic re-exports
    // (`export *` from a CommonJS module) must stay extensible so the dynamic
    // export proxy can surface keys discovered at runtime, so skip the seal for
    // them.
    if (!dynamic) Object.seal(exports);
}
/**
 * Makes the module an ESM with exports
 */ function esmExport(bindings, id, dynamic) {
    var module;
    var exports;
    if (id != null) {
        module = getOverwrittenModule(this.c, id);
        exports = module.exports;
    } else {
        module = this.m;
        exports = this.e;
    }
    module.namespaceObject = exports;
    esm(exports, bindings, dynamic);
}
contextPrototype.s = esmExport;
function ensureDynamicExports(module, exports) {
    var reexportedObjects = REEXPORTED_OBJECTS.get(module);
    if (!reexportedObjects) {
        REEXPORTED_OBJECTS.set(module, reexportedObjects = []);
        // Returns the re-exported object that provides `prop` as an own property,
        // or `undefined` if none does. The traps share this logic so they always
        // agree on which keys are synthesized from `reexportedObjects`. `default`
        // is never re-exported by `export *`, so it is never synthesized.
        var reexportOwning = function reexportOwning(prop) {
            if (prop !== 'default') {
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = reexportedObjects[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var obj = _step.value;
                        if (hasOwnProperty.call(obj, prop)) return obj;
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }
            return undefined;
        };
        // Modules with dynamic re-exports are not sealed by `esm()`, so the
        // target beneath the namespace stays extensible. That is what lets the
        // `ownKeys` and `getOwnPropertyDescriptor` traps legally report keys that
        // exist on `reexportedObjects` but not on the target itself.
        module.exports = module.namespaceObject = new Proxy(exports, {
            get: function get(target, prop) {
                if (hasOwnProperty.call(target, prop) || prop === 'default' || prop === '__esModule') {
                    return Reflect.get(target, prop);
                }
                var obj = reexportOwning(prop);
                return obj && Reflect.get(obj, prop);
            },
            // The namespace is read-only, like a real esm namespace object. The
            // re-exported modules can still mutate their own exports (exposed live
            // via `get`), but mutating the namespace itself is rejected. Refusing
            // here, rather than forwarding to the extensible target, also prevents an
            // assignment/definition from shadowing a dynamic re-export. It also
            // prevents delete from removing a static export.
            set: function set() {
                return false;
            },
            defineProperty: function defineProperty() {
                return false;
            },
            deleteProperty: function deleteProperty() {
                return false;
            },
            // The `has` trap ensures that `'exportName' in starImports` will reflect
            // the truth of whether a key is exported.
            has: function has(target, prop) {
                if (Reflect.has(target, prop)) return true;
                if (prop === 'default' || prop === '__esModule') return false;
                return reexportOwning(prop) !== undefined;
            },
            // ownKeys and getOwnPropertyDescriptor together make the keys enumerable.
            // If a value is returned from `ownKeys` but its property descriptor is
            // not enumerable, it will not be visible to iterator methods.
            // Collectively, they allow code like the following:
            //
            // ```
            // // module.js re-exports dynamic CJS exports
            // export * from './legacyModule.cjs'
            //
            // // from another JS file, reference the re-exported dynamic values
            // import * as Namespace from './module.js'
            // Object.keys(Namespace)
            // ```
            ownKeys: function ownKeys(target) {
                var keys = Reflect.ownKeys(target);
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = reexportedObjects[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var obj = _step.value;
                        var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                        try {
                            for(var _iterator1 = Reflect.ownKeys(obj)[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                                var key = _step1.value;
                                if (key !== 'default' && !keys.includes(key)) keys.push(key);
                            }
                        } catch (err) {
                            _didIteratorError1 = true;
                            _iteratorError1 = err;
                        } finally{
                            try {
                                if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                                    _iterator1.return();
                                }
                            } finally{
                                if (_didIteratorError1) {
                                    throw _iteratorError1;
                                }
                            }
                        }
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
                return keys;
            },
            getOwnPropertyDescriptor: function getOwnPropertyDescriptor(target, prop) {
                var own = Reflect.getOwnPropertyDescriptor(target, prop);
                if (own || prop === 'default' || prop === '__esModule') return own;
                var obj = reexportOwning(prop);
                if (obj) {
                    // Synthetic keys don't exist on the target, so they MUST be
                    // reported as configurable. However the set/delete traps above will
                    // prevent them from actually being changed
                    return {
                        enumerable: true,
                        configurable: true,
                        get: function get() {
                            return Reflect.get(obj, prop);
                        }
                    };
                }
                return undefined;
            }
        });
    }
    return reexportedObjects;
}
/**
 * Dynamically exports properties from an object
 */ function dynamicExport(object, id) {
    var module;
    var exports;
    if (id != null) {
        module = getOverwrittenModule(this.c, id);
        exports = module.exports;
    } else {
        module = this.m;
        exports = this.e;
    }
    var reexportedObjects = ensureDynamicExports(module, exports);
    if ((typeof object === "undefined" ? "undefined" : _type_of(object)) === 'object' && object !== null) {
        reexportedObjects.push(object);
    }
}
contextPrototype.j = dynamicExport;
function exportValue(value, id) {
    var module;
    if (id != null) {
        module = getOverwrittenModule(this.c, id);
    } else {
        module = this.m;
    }
    module.exports = value;
}
contextPrototype.v = exportValue;
function exportNamespace(namespace, id) {
    var module;
    if (id != null) {
        module = getOverwrittenModule(this.c, id);
    } else {
        module = this.m;
    }
    module.exports = module.namespaceObject = namespace;
}
contextPrototype.n = exportNamespace;
function createGetter(obj, key) {
    return function() {
        return obj[key];
    };
}
/**
 * @returns prototype of the object
 */ var getProto = Object.getPrototypeOf ? function(obj) {
    return Object.getPrototypeOf(obj);
} : function(obj) {
    return obj.__proto__;
};
/** Prototypes that are not expanded for exports */ var LEAF_PROTOTYPES = [
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
    var bindings = [];
    var defaultLocation = -1;
    for(var current = raw; ((typeof current === "undefined" ? "undefined" : _type_of(current)) === 'object' || typeof current === 'function') && !LEAF_PROTOTYPES.includes(current); current = getProto(current)){
        var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
        try {
            for(var _iterator = Object.getOwnPropertyNames(current)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                var key = _step.value;
                bindings.push(key, createGetter(raw, key));
                if (defaultLocation === -1 && key === 'default') {
                    defaultLocation = bindings.length - 1;
                }
            }
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion && _iterator.return != null) {
                    _iterator.return();
                }
            } finally{
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }
    }
    // this is not really correct
    // we should set the `default` getter if the imported module is a `.cjs file`
    if (!(allowExportDefault && defaultLocation >= 0)) {
        // Replace the binding with one for the namespace itself in order to preserve iteration order.
        if (defaultLocation >= 0) {
            // Replace the getter with the value
            bindings.splice(defaultLocation, 1, BindingTag_Value, raw);
        } else {
            bindings.push('default', BindingTag_Value, raw);
        }
    }
    esm(ns, bindings);
    return ns;
}
function createNS(raw) {
    if (typeof raw === 'function') {
        return function() {
            for(var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++){
                args[_key] = arguments[_key];
            }
            return raw.apply(this, args);
        };
    } else {
        return Object.create(null);
    }
}
function esmImport(id) {
    var module = getOrInstantiateModuleFromParent(id, this.m);
    // any ES module has to have `module.namespaceObject` defined.
    if (module.namespaceObject) return module.namespaceObject;
    // only ESM can be an async module, so we don't need to worry about exports being a promise here.
    var raw = module.exports;
    return module.namespaceObject = interopEsm(raw, createNS(raw), raw && raw.__esModule);
}
contextPrototype.i = esmImport;
function asyncLoader(moduleId) {
    var loader = this.r(moduleId);
    return loader(esmImport.bind(this));
}
contextPrototype.A = asyncLoader;
// Add a simple runtime require so that environments without one can still pass
// `typeof require` CommonJS checks so that exports are correctly registered.
var runtimeRequire = // @ts-ignore
typeof require === 'function' ? require : function require1() {
    throw new Error('Unexpected use of runtime require');
};
contextPrototype.t = runtimeRequire;
function commonJsRequire(id) {
    return getOrInstantiateModuleFromParent(id, this.m).exports;
}
contextPrototype.r = commonJsRequire;
/**
 * Remove fragments and query parameters since they are never part of the context map keys
 *
 * This matches how we parse patterns at resolving time.  Arguably we should only do this for
 * strings passed to `import` but the resolve does it for `import` and `require` and so we do
 * here as well.
 */ function parseRequest(request) {
    // Per the URI spec fragments can contain `?` characters, so we should trim it off first
    // https://datatracker.ietf.org/doc/html/rfc3986#section-3.5
    var hashIndex = request.indexOf('#');
    if (hashIndex !== -1) {
        request = request.substring(0, hashIndex);
    }
    var queryIndex = request.indexOf('?');
    if (queryIndex !== -1) {
        request = request.substring(0, queryIndex);
    }
    return request;
}
/**
 * `require.context` and require/import expression runtime.
 */ function moduleContext(map) {
    function moduleContext(id) {
        id = parseRequest(id);
        if (hasOwnProperty.call(map, id)) {
            return map[id].module();
        }
        var e = new Error(`Cannot find module '${id}'`);
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    }
    moduleContext.keys = function() {
        return Object.keys(map);
    };
    moduleContext.resolve = function(id) {
        id = parseRequest(id);
        if (hasOwnProperty.call(map, id)) {
            return map[id].id();
        }
        var e = new Error(`Cannot find module '${id}'`);
        e.code = 'MODULE_NOT_FOUND';
        throw e;
    };
    moduleContext.import = function(id) {
        return _async_to_generator(function() {
            return _ts_generator(this, function(_state) {
                switch(_state.label){
                    case 0:
                        return [
                            4,
                            moduleContext(id)
                        ];
                    case 1:
                        return [
                            2,
                            _state.sent()
                        ];
                }
            });
        })();
    };
    return moduleContext;
}
contextPrototype.f = moduleContext;
/**
 * Returns the path of a chunk defined by its data.
 */ function getChunkPath(chunkData) {
    return typeof chunkData === 'string' ? chunkData : chunkData.path;
}
// Load the CompressedmoduleFactories of a chunk into the `moduleFactories` Map.
// The CompressedModuleFactories format is
// - 1 or more module ids
// - a module factory function
// So walking this is a little complex but the flat structure is also fast to
// traverse, we can use `typeof` operators to distinguish the two cases.
function installCompressedModuleFactories(chunkModules, offset, moduleFactories, newModuleId) {
    var i = offset;
    while(i < chunkModules.length){
        var end = i + 1;
        // Find our factory function
        while(end < chunkModules.length && typeof chunkModules[end] !== 'function'){
            end++;
        }
        if (end === chunkModules.length) {
            throw new Error('malformed chunk format, expected a factory function');
        }
        // Install the factory for each module ID that doesn't already have one.
        // When some IDs in this group already have a factory, reuse that existing
        // group factory for the missing IDs to keep all IDs in the group consistent.
        // Otherwise, install the factory from this chunk.
        var moduleFactoryFn = chunkModules[end];
        var existingGroupFactory = undefined;
        for(var j = i; j < end; j++){
            var id = chunkModules[j];
            var existingFactory = moduleFactories.get(id);
            if (existingFactory) {
                existingGroupFactory = existingFactory;
                break;
            }
        }
        var factoryToInstall = existingGroupFactory !== null && existingGroupFactory !== void 0 ? existingGroupFactory : moduleFactoryFn;
        var didInstallFactory = false;
        for(var j1 = i; j1 < end; j1++){
            var id1 = chunkModules[j1];
            if (!moduleFactories.has(id1)) {
                if (!didInstallFactory) {
                    if (factoryToInstall === moduleFactoryFn) {
                        applyModuleFactoryName(moduleFactoryFn);
                    }
                    didInstallFactory = true;
                }
                moduleFactories.set(id1, factoryToInstall);
                newModuleId === null || newModuleId === void 0 ? void 0 : newModuleId(id1);
            }
        }
        i = end + 1; // end is pointing at the last factory advance to the next id or the end of the array.
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
 */ var relativeURL = function relativeURL(inputUrl) {
    var realUrl = new URL(inputUrl, 'x:/');
    var values = {};
    for(var key in realUrl)values[key] = realUrl[key];
    values.href = inputUrl;
    values.pathname = inputUrl.replace(/[?#].*/, '');
    values.origin = values.protocol = '';
    values.toString = values.toJSON = function() {
        for(var _len = arguments.length, _args = new Array(_len), _key = 0; _key < _len; _key++){
            _args[_key] = arguments[_key];
        }
        return inputUrl;
    };
    for(var key1 in values)Object.defineProperty(this, key1, {
        enumerable: true,
        configurable: true,
        value: values[key1]
    });
};
relativeURL.prototype = URL.prototype;
contextPrototype.U = relativeURL;
/**
 * Utility function to ensure all variants of an enum are handled.
 */ function invariant(never, computeMessage) {
    throw new Error(`Invariant: ${computeMessage(never)}`);
}
/**
 * Constructs an error message for when a module factory is not available.
 */ function factoryNotAvailableMessage(moduleId, sourceType, sourceData) {
    var instantiationReason;
    switch(sourceType){
        case 0:
            instantiationReason = `as a runtime entry of chunk ${sourceData}`;
            break;
        case 1:
            instantiationReason = `because it was required from module ${sourceData}`;
            break;
        case 2:
            instantiationReason = 'because of an HMR update';
            break;
        default:
            invariant(sourceType, function(sourceType) {
                return `Unknown source type: ${sourceType}`;
            });
    }
    return `Module ${moduleId} was instantiated ${instantiationReason}, but the module factory is not available.`;
}
/**
 * A stub function to make `require` available but non-functional in ESM.
 */ function requireStub(_moduleId) {
    throw new Error('dynamic usage of require is not supported');
}
contextPrototype.z = requireStub;
// Make `globalThis` available to the module in a way that cannot be shadowed by a local variable.
contextPrototype.g = globalThis;
function applyModuleFactoryName(factory) {
    // Give the module factory a nice name to improve stack traces.
    Object.defineProperty(factory, 'name', {
        value: 'module evaluation'
    });
}
/**
 * This file contains runtime types and functions that are shared between all
 * Turbopack *browser* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime/runtime-utils.ts" />
// Used in WebWorkers to tell the runtime about the chunk suffix
function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _iterable_to_array_limit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;
    var _s, _e;
    try {
        for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
        }
    } catch (err) {
        _d = true;
        _e = err;
    } finally{
        try {
            if (!_n && _i["return"] != null) _i["return"]();
        } finally{
            if (_d) throw _e;
        }
    }
    return _arr;
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
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
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
var browserContextPrototype = Context.prototype;
var moduleFactories = new Map();
contextPrototype.M = moduleFactories;
var availableModules = new Map();
var availableModuleChunks = new Map();
// Registry mapping a merged chunk's path to its constituent component chunk paths.
var chunkComponents = new Map();
// Registry mapping a component chunk's path to its size in bytes, used by the
// split-vs-whole cost heuristic.
var componentChunkSizes = new Map();
function registerComponentChunkSizes(componentChunks, sizes) {
    for(var i = 0; i < componentChunks.length; i++){
        var size = sizes[i];
        if (size !== undefined) {
            componentChunkSizes.set(componentChunks[i], size);
        }
    }
}
// Memoizes the composite promise returned for a merged chunk loaded by URL, keyed by URL.
var splitChunkPromises = new Map();
function loadChunk(chunkData) {
    return loadChunkInternal(SourceType.Parent, this.m.id, chunkData);
}
browserContextPrototype.l = loadChunk;
// `chunkPath` is the source chunk; it is `undefined` for entry-only registrations,
// which have no self chunk.
function loadInitialChunk(chunkPath, chunkData) {
    return loadChunkInternal(SourceType.Runtime, chunkPath, chunkData);
}
function loadChunkInternal(sourceType, sourceData, chunkData) {
    return _async_to_generator(function() {
        var includedList, modulesPromises, promise, componentChunks, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, included;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    if (typeof chunkData === 'string') {
                        return [
                            2,
                            loadChunkPath(sourceType, sourceData, chunkData)
                        ];
                    }
                    includedList = chunkData.included || [];
                    modulesPromises = includedList.map(function(included) {
                        if (moduleFactories.has(included)) return true;
                        return availableModules.get(included);
                    });
                    if (!(modulesPromises.length > 0 && modulesPromises.every(function(p) {
                        return p;
                    }))) return [
                        3,
                        2
                    ];
                    // When all included items are already loaded or loading, we can skip loading ourselves
                    return [
                        4,
                        Promise.all(modulesPromises)
                    ];
                case 1:
                    _state.sent();
                    return [
                        2
                    ];
                case 2:
                    if (SUPPORT_COMPONENT_CHUNKS) {
                        componentChunks = chunkData.moduleChunks || [];
                        // We already have this chunk's component list inline (chunkData.moduleChunks) and split on it
                        // here, so the whole-chunk fallback uses loadChunkByUrlWhole to skip loadChunkByUrlInternal's
                        // chunkComponents-registry lookup, which would just repeat the same split decision.
                        promise = loadComponentChunksOrWhole(sourceType, sourceData, componentChunks, getChunkRelativeUrl(chunkData.path));
                    } else {
                        promise = loadChunkByUrlWhole(sourceType, sourceData, getChunkRelativeUrl(chunkData.path));
                    }
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(_iterator = includedList[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            included = _step.value;
                            if (!availableModules.has(included)) {
                                // It might be better to race old and new promises, but it's rare that the new promise will be faster than a request started earlier.
                                // In production it's even more rare, because the chunk optimization tries to deduplicate modules anyway.
                                availableModules.set(included, promise);
                            }
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return != null) {
                                _iterator.return();
                            }
                        } finally{
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                    return [
                        4,
                        promise
                    ];
                case 3:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
}
/**
 * Approximate cost of an extra HTTP request, expressed in emitted (minified, uncompressed) chunk
 * bytes, used to decide whether splitting a merged chunk into individually-cached component
 * chunks is worthwhile.
 */ var REQUEST_COST_BYTES = 20_000;
/**
 * Decides whether to load a merged chunk's component chunks individually instead of the whole
 * merged chunk, weighing the bytes saved (the available components we avoid re-downloading)
 * against the extra network requests splitting incurs.
 *
 * Splitting issues one request per unavailable component vs. a single request for the merged
 * chunk, so it adds `unavailableCount - 1` extra requests. When at most one component needs the
 * network, splitting never costs more requests than the merged load (and transfers fewer bytes),
 * so it always wins. Otherwise it's only worth it when the available bytes exceed the extra
 * request cost.
 */ function shouldLoadComponentChunks(availableBytes, unavailableCount) {
    if (unavailableCount <= 1) {
        return true;
    }
    return availableBytes > REQUEST_COST_BYTES * (unavailableCount - 1);
}
/**
 * Loads a chunk's component chunks individually when enough of them are already available
 * in memory (avoiding re-downloading the ones we have, per `shouldLoadComponentChunks`),
 * otherwise loads the whole chunk from `chunkUrl` and records its component chunks as available.
 */ function loadComponentChunksOrWhole(sourceType, sourceData, componentChunks, chunkUrl) {
    var componentChunkPromises = [];
    var availableBytes = 0;
    var unavailableCount = 0;
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = componentChunks[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var componentChunk = _step.value;
            var available = availableModuleChunks.get(componentChunk);
            if (available) {
                var _componentChunkSizes_get;
                componentChunkPromises.push(available);
                availableBytes += (_componentChunkSizes_get = componentChunkSizes.get(componentChunk)) !== null && _componentChunkSizes_get !== void 0 ? _componentChunkSizes_get : 0;
            } else {
                unavailableCount++;
            }
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
                _iterator.return();
            }
        } finally{
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }
    if (componentChunkPromises.length > 0 && shouldLoadComponentChunks(availableBytes, unavailableCount)) {
        var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
        try {
            // Enough component chunks are already loaded or loading that splitting saves more
            // bytes than the extra requests cost.
            for(var _iterator1 = componentChunks[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                var componentChunk1 = _step1.value;
                if (!availableModuleChunks.has(componentChunk1)) {
                    var promise = loadChunkPath(sourceType, sourceData, componentChunk1);
                    availableModuleChunks.set(componentChunk1, promise);
                    componentChunkPromises.push(promise);
                }
            }
        } catch (err) {
            _didIteratorError1 = true;
            _iteratorError1 = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                    _iterator1.return();
                }
            } finally{
                if (_didIteratorError1) {
                    throw _iteratorError1;
                }
            }
        }
        return Promise.all(componentChunkPromises);
    }
    // Not enough is available in memory for splitting to pay off. Load the
    // whole chunk in a single request and record its component chunks as available.
    var promise1 = loadChunkByUrlWhole(sourceType, sourceData, chunkUrl);
    var _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
    try {
        for(var _iterator2 = componentChunks[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true){
            var componentChunk2 = _step2.value;
            if (!availableModuleChunks.has(componentChunk2)) {
                availableModuleChunks.set(componentChunk2, promise1);
            }
        }
    } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
                _iterator2.return();
            }
        } finally{
            if (_didIteratorError2) {
                throw _iteratorError2;
            }
        }
    }
    return promise1;
}
var loadedChunk = Promise.resolve(undefined);
var instrumentedBackendLoadChunks = new WeakMap();
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrl(chunkEntry) {
    return loadChunkByUrlInternal(SourceType.Parent, this.m.id, chunkEntry);
}
browserContextPrototype.L = loadChunkByUrl;
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlInternal(sourceType, sourceData, chunkEntry) {
    if (SUPPORT_COMPONENT_CHUNKS) {
        // A merged chunk arrives as a `[url, componentChunkPaths, componentChunkSizes]` array. Register
        // the components so a by-URL load of this merged chunk — now or from a later navigation — can
        // be split, and so `registerChunk` can mark them available when the whole chunk loads.
        var chunkUrl;
        var components;
        if (typeof chunkEntry === 'string') {
            chunkUrl = chunkEntry;
        } else {
            var componentSizes;
            var ref;
            ref = _sliced_to_array(chunkEntry, 3), chunkUrl = ref[0], components = ref[1], componentSizes = ref[2], ref;
            registerComponentChunkSizes(components, componentSizes);
        }
        var chunkPath = chunkUrlToPath(chunkUrl);
        if (components !== undefined) {
            chunkComponents.set(chunkPath, components);
        } else {
            // A plain URL may still be a merged chunk we already registered from its array.
            components = chunkComponents.get(chunkPath);
        }
        // If we have component chunks for this merged chunk, load only the ones we don't already have
        // instead of the whole merged chunk.
        if (components !== undefined) {
            var promise = splitChunkPromises.get(chunkUrl);
            if (promise === undefined) {
                promise = loadComponentChunksOrWhole(sourceType, sourceData, components, chunkUrl);
                splitChunkPromises.set(chunkUrl, promise);
            }
            return promise;
        }
        // This is a non-merged chunk. If its modules were already loaded — e.g. this chunk is a
        // component of a merged chunk fetched on a previous navigation — reuse that load instead of
        // re-downloading.
        var existing = availableModuleChunks.get(chunkPath);
        if (existing !== undefined) {
            return existing === true ? loadedChunk : existing;
        }
        var promise1 = loadChunkByUrlWhole(sourceType, sourceData, chunkUrl);
        availableModuleChunks.set(chunkPath, promise1);
        return promise1;
    }
    // Component chunks are disabled, so the chunking context never emits merged arrays and every
    // entry is a plain chunk URL. Load it whole; the backend dedupes repeated URLs.
    return loadChunkByUrlWhole(sourceType, sourceData, chunkEntry);
}
// Convert a chunk URL back to its ChunkPath (strip base path, query/hash, decode), to
// match the keys stored in `chunkComponents`.
function chunkUrlToPath(chunkUrl) {
    var src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''));
    return src.startsWith(CHUNK_BASE_PATH) ? src.slice(CHUNK_BASE_PATH.length) : src;
}
/**
 * When a merged chunk finishes registering (e.g. an initial-load `<script>`), mark its
 * component chunks as available so a later by-URL load of a *different* merged chunk that
 * shares a component skips re-downloading it. Called from `registerChunk`.
 */ function markChunkComponentsAvailable(chunk) {
    if (chunkComponents.size === 0) return;
    var components = chunkComponents.get(getPathFromScript(chunk));
    if (components === undefined) return;
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = components[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var componentChunk = _step.value;
            if (!availableModuleChunks.has(componentChunk)) {
                availableModuleChunks.set(componentChunk, true);
            }
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
                _iterator.return();
            }
        } finally{
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }
}
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlWhole(sourceType, sourceData, chunkUrl) {
    var thenable = BACKEND.loadChunkCached(sourceType, chunkUrl);
    var entry = instrumentedBackendLoadChunks.get(thenable);
    if (entry === undefined) {
        var resolve = instrumentedBackendLoadChunks.set.bind(instrumentedBackendLoadChunks, thenable, loadedChunk);
        entry = thenable.then(resolve).catch(function(cause) {
            var loadReason;
            switch(sourceType){
                case SourceType.Runtime:
                    loadReason = `as a runtime dependency of chunk ${sourceData}`;
                    break;
                case SourceType.Parent:
                    loadReason = `from module ${sourceData}`;
                    break;
                case SourceType.Update:
                    loadReason = 'from an HMR update';
                    break;
                default:
                    invariant(sourceType, function(sourceType) {
                        return `Unknown source type: ${sourceType}`;
                    });
            }
            var error = new Error(`Failed to load chunk ${chunkUrl} ${loadReason}${cause ? `: ${cause}` : ''}`, cause ? {
                cause: cause
            } : undefined);
            error.name = 'ChunkLoadError';
            throw error;
        });
        instrumentedBackendLoadChunks.set(thenable, entry);
    }
    return entry;
}
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkPath(sourceType, sourceData, chunkPath) {
    var url = getChunkRelativeUrl(chunkPath);
    return loadChunkByUrlInternal(sourceType, sourceData, url);
}
/**
 * Returns an absolute url to an asset.
 */ function resolvePathFromModule(moduleId) {
    var _ref;
    var exported = this.r(moduleId);
    return (_ref = exported === null || exported === void 0 ? void 0 : exported.default) !== null && _ref !== void 0 ? _ref : exported;
}
browserContextPrototype.R = resolvePathFromModule;
/**
 * no-op for browser
 * @param modulePath
 */ function resolveAbsolutePath(modulePath) {
    return `/ROOT/${modulePath !== null && modulePath !== void 0 ? modulePath : ''}`;
}
browserContextPrototype.P = resolveAbsolutePath;
/**
 * Returns a placeholder `file://` URL for the given module path. The browser
 * runtime intentionally does not expose the real filesystem path. Path
 * segments are percent-encoded so the result is always a valid file URI.
 */ function resolveFileUrl(modulePath) {
    if (!modulePath) return 'file:///ROOT/';
    return `file:///ROOT/${modulePath.split('/').map(encodeURIComponent).join('/')}`;
}
browserContextPrototype.F = resolveFileUrl;
/**
 * Exports a URL with the static suffix appended.
 */ function exportUrl(url, id) {
    exportValue.call(this, `${url}${ASSET_SUFFIX}`, id);
}
browserContextPrototype.q = exportUrl;
/**
 * Instantiates a runtime module.
 */ function instantiateRuntimeModule(moduleId, chunkPath) {
    return instantiateModule(moduleId, SourceType.Runtime, chunkPath);
}
/**
 * Returns the URL relative to the origin where a chunk can be fetched from.
 */ function getChunkRelativeUrl(chunkPath) {
    var basePath = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : CHUNK_BASE_PATH;
    return `${basePath}${chunkPath.split('/').map(function(p) {
        return encodeURIComponent(p);
    }).join('/')}${ASSET_SUFFIX}`;
}
// Shared runtime primitives consumed by the bundled `createWorker` helper,
// exposed as `__turbopack_chunk_base_path__` and `__turbopack_chunk_asset_suffix__`.
browserContextPrototype.b = CHUNK_BASE_PATH;
browserContextPrototype.X = ASSET_SUFFIX;
// Shared runtime primitive: build a chunk's URL. Used by the bundled worker
// helper and the WASM helper, exposed as `__turbopack_chunk_relative_url__`.
browserContextPrototype.h = getChunkRelativeUrl;
function getPathFromScript(chunkScript) {
    if (typeof chunkScript === 'string') {
        return chunkScript;
    }
    var chunkUrl = chunkScript.src;
    var src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''));
    var path = src.startsWith(CHUNK_BASE_PATH) ? src.slice(CHUNK_BASE_PATH.length) : src;
    return path;
}
/**
 * Return the ChunkUrl from a ChunkScript.
 */ function getUrlFromScript(chunk) {
    if (typeof chunk === 'string') {
        return getChunkRelativeUrl(chunk);
    } else {
        // This is already exactly what we want
        return chunk.src;
    }
}
/**
 * Determine the chunk to register. Note that this function has side-effects!
 */ function getChunkFromRegistration(chunk) {
    if (typeof chunk === 'string') {
        return chunk;
    } else if (!chunk) {
        if (typeof TURBOPACK_NEXT_CHUNK_URLS !== 'undefined') {
            return {
                src: TURBOPACK_NEXT_CHUNK_URLS.pop()
            };
        } else {
            throw new Error('chunk path empty but not in a worker');
        }
    } else {
        return {
            src: chunk.getAttribute('src')
        };
    }
}
/**
 * Checks if a given path/URL ends with the given extension,
 * optionally followed by ?query or #fragment.
 */ function endsWithExtension(chunkUrlOrPath, ext) {
    // Find where the path ends (before query or fragment)
    var q = chunkUrlOrPath.indexOf('?');
    var end;
    if (q !== -1) {
        end = q;
    } else {
        var h = chunkUrlOrPath.indexOf('#');
        end = h !== -1 ? h : chunkUrlOrPath.length;
    }
    // Check if the path portion ends with the extension
    return end >= ext.length && chunkUrlOrPath.startsWith(ext, end - ext.length);
}
function isJs(chunkUrlOrPath) {
    return endsWithExtension(chunkUrlOrPath, '.js');
}
function isCss(chunkUrl) {
    return endsWithExtension(chunkUrl, '.css');
}
/// <reference path="./runtime-base.ts" />
/// <reference path="./dummy.ts" />
var moduleCache = {};
contextPrototype.c = moduleCache;
/**
 * Gets or instantiates a runtime module.
 */ // @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getOrInstantiateRuntimeModule(chunkPath, moduleId) {
    var module = moduleCache[moduleId];
    if (module) {
        if (module.error) {
            throw module.error;
        }
        return module;
    }
    return instantiateModule(moduleId, SourceType.Runtime, chunkPath);
}
/**
 * Retrieves a module from the cache, or instantiate it if it is not cached.
 */ // Used by the backend
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
var getOrInstantiateModuleFromParent = function getOrInstantiateModuleFromParent(id, sourceModule) {
    var module = moduleCache[id];
    if (module) {
        if (module.error) {
            throw module.error;
        }
        return module;
    }
    return instantiateModule(id, SourceType.Parent, sourceModule.id);
};
function instantiateModule(id, sourceType, sourceData) {
    var moduleFactory = moduleFactories.get(id);
    if (typeof moduleFactory !== 'function') {
        // This can happen if modules incorrectly handle HMR disposes/updates,
        // e.g. when they keep a `setTimeout` around which still executes old code
        // and contains e.g. a `require("something")` call.
        throw new Error(factoryNotAvailableMessage(id, sourceType, sourceData));
    }
    var module = createModuleObject(id);
    var exports = module.exports;
    moduleCache[id] = module;
    // NOTE(alexkirsz) This can fail when the module encounters a runtime error.
    var context = new Context(module, exports);
    try {
        moduleFactory(context, module, exports);
    } catch (error) {
        module.error = error;
        throw error;
    }
    if (module.namespaceObject && module.exports !== module.namespaceObject) {
        // in case of a circular dependency: cjs1 -> esm2 -> cjs1
        interopEsm(module.exports, module.namespaceObject);
    }
    return module;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerChunk(registration) {
    // An inlined entry-only registration is a bare params object (no source chunk).
    if (!Array.isArray(registration)) {
        return BACKEND.registerChunk(undefined, registration);
    }
    var chunk = getChunkFromRegistration(registration[0]);
    if (SUPPORT_COMPONENT_CHUNKS) {
        markChunkComponentsAvailable(chunk);
    }
    var runtimeParams;
    // When bootstrapping we are passed a single runtimeParams object so we can distinguish purely based on length
    if (registration.length === 2) {
        runtimeParams = registration[1];
    } else {
        runtimeParams = undefined;
        installCompressedModuleFactories(registration, /* offset= */ 1, moduleFactories);
    }
    return BACKEND.registerChunk(chunk, runtimeParams);
}
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) {
        resolve(value);
    } else {
        Promise.resolve(value).then(_next, _throw);
    }
}
function _async_to_generator(fn) {
    return function() {
        var self1 = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self1, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else {
        return left instanceof right;
    }
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
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
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
/**
 * This file contains the runtime code specific to the Turbopack ECMAScript DOM runtime.
 *
 * It will be appended to the base runtime code.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime/runtime-types.d.ts" />
function getAssetSuffixFromScriptSrc() {
    var _ref;
    var _document_currentScript_getAttribute, _document_currentScript, _document;
    // TURBOPACK_ASSET_SUFFIX is set in web workers
    if (self.TURBOPACK_ASSET_SUFFIX != null) return self.TURBOPACK_ASSET_SUFFIX;
    var src = (_ref = (_document = document) === null || _document === void 0 ? void 0 : (_document_currentScript = _document.currentScript) === null || _document_currentScript === void 0 ? void 0 : (_document_currentScript_getAttribute = _document_currentScript.getAttribute) === null || _document_currentScript_getAttribute === void 0 ? void 0 : _document_currentScript_getAttribute.call(_document_currentScript, 'src')) !== null && _ref !== void 0 ? _ref : '';
    var qi = src.indexOf('?');
    return qi >= 0 ? src.slice(qi) : '';
}
var BACKEND;
/**
 * Maps chunk paths to the corresponding resolver.
 */ var chunkResolvers = new Map();
(function() {
    BACKEND = {
        registerChunk: function registerChunk(chunk, params) {
            return _async_to_generator(function() {
                var chunkPath, resolver, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, otherChunkData, otherChunkPath, otherChunkUrl, _iteratorNormalCompletion1, _didIteratorError1, _iteratorError1, _iterator1, _step1, moduleId;
                return _ts_generator(this, function(_state) {
                    switch(_state.label){
                        case 0:
                            if (chunk != null) {
                                chunkPath = getPathFromScript(chunk);
                                resolver = getOrCreateResolver(getUrlFromScript(chunk));
                                resolver.resolve();
                            }
                            if (params == null) {
                                return [
                                    2
                                ];
                            }
                            _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                            try {
                                for(_iterator = params.otherChunks[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                                    otherChunkData = _step.value;
                                    otherChunkPath = getChunkPath(otherChunkData);
                                    otherChunkUrl = getChunkRelativeUrl(otherChunkPath);
                                    // Chunk might have started loading, so we want to avoid triggering another load.
                                    getOrCreateResolver(otherChunkUrl);
                                }
                            } catch (err) {
                                _didIteratorError = true;
                                _iteratorError = err;
                            } finally{
                                try {
                                    if (!_iteratorNormalCompletion && _iterator.return != null) {
                                        _iterator.return();
                                    }
                                } finally{
                                    if (_didIteratorError) {
                                        throw _iteratorError;
                                    }
                                }
                            }
                            // This waits for chunks to be loaded, but also marks included items as available.
                            return [
                                4,
                                Promise.all(params.otherChunks.map(function(otherChunkData) {
                                    return loadInitialChunk(chunkPath, otherChunkData);
                                }))
                            ];
                        case 1:
                            _state.sent();
                            if (params.runtimeModuleIds.length > 0) {
                                _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                                try {
                                    for(_iterator1 = params.runtimeModuleIds[Symbol.iterator](); !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                                        moduleId = _step1.value;
                                        getOrInstantiateRuntimeModule(chunkPath, moduleId);
                                    }
                                } catch (err) {
                                    _didIteratorError1 = true;
                                    _iteratorError1 = err;
                                } finally{
                                    try {
                                        if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                                            _iterator1.return();
                                        }
                                    } finally{
                                        if (_didIteratorError1) {
                                            throw _iteratorError1;
                                        }
                                    }
                                }
                            }
                            return [
                                2
                            ];
                    }
                });
            })();
        },
        /**
     * Loads the given chunk, and returns a promise that resolves once the chunk
     * has been loaded.
     */ loadChunkCached: function loadChunkCached(sourceType, chunkUrl) {
            return doLoadChunk(sourceType, chunkUrl);
        }
    };
    function getOrCreateResolver(chunkUrl) {
        var resolver = chunkResolvers.get(chunkUrl);
        if (!resolver) {
            var resolve;
            var reject;
            var promise = new Promise(function(innerResolve, innerReject) {
                resolve = innerResolve;
                reject = innerReject;
            });
            resolver = {
                resolved: false,
                loadingStarted: false,
                retryAttempts: 0,
                promise: promise,
                resolve: function resolve1() {
                    resolver.resolved = true;
                    resolve();
                },
                reject: reject
            };
            chunkResolvers.set(chunkUrl, resolver);
        }
        return resolver;
    }
    /**
   * Rejects a chunk resolver and drops it from the cache.
   * We don't want to cache failed chunk loads: a later
   * request for the same chunk should try again.
   */ function rejectChunkResolver(chunkUrl, resolver, error) {
        if (chunkResolvers.get(chunkUrl) === resolver) {
            chunkResolvers.delete(chunkUrl);
        }
        resolver.reject(error);
    }
    function getChunkLoadRetryDelayMs() {
        var jitter = Math.floor(Math.random() * (CHUNK_LOAD_RETRY_MAX_JITTER_MS + 1));
        return CHUNK_LOAD_RETRY_BASE_DELAY_MS + jitter;
    }
    function isRetryableChunkLoadError(error) {
        return error == null || _instanceof(error, DOMException) && error.name === 'NetworkError';
    }
    /**
   * Handles a failed chunk load: retries the load once after a short delay.
   */ function onChunkLoadError(sourceType, chunkUrl, resolver, error, reload) {
        if (!isRetryableChunkLoadError(error) || resolver.retryAttempts >= CHUNK_LOAD_RETRY_MAX_ATTEMPTS || chunkResolvers.get(chunkUrl) !== resolver) {
            rejectChunkResolver(chunkUrl, resolver, error);
            return;
        }
        resolver.retryAttempts++;
        setTimeout(function() {
            // if this chunk is being fetched multiple times, and one of those
            // attempts succeeds. or, if this chunk has another resolver
            // mapped to it - it's safe to skip retrying.
            if (resolver.resolved || chunkResolvers.get(chunkUrl) !== resolver) {
                return;
            }
            if (reload) {
                reload();
            } else {
                resolver.loadingStarted = false;
                doLoadChunk(sourceType, chunkUrl);
            }
        }, getChunkLoadRetryDelayMs());
    }
    /**
   * Loads the given chunk, and returns a promise that resolves once the chunk
   * has been loaded.
   */ function doLoadChunk(sourceType, chunkUrl) {
        var resolver = getOrCreateResolver(chunkUrl);
        if (resolver.loadingStarted) {
            return resolver.promise;
        }
        if (sourceType === SourceType.Runtime) {
            // We don't need to load chunks references from runtime code, as they're already
            // present in the DOM.
            resolver.loadingStarted = true;
            if (isCss(chunkUrl)) {
                // CSS chunks do not register themselves, and as such must be marked as
                // loaded instantly.
                resolver.resolve();
            }
            // We need to wait for JS chunks to register themselves within `registerChunk`
            // before we can start instantiating runtime modules, hence the absence of
            // `resolver.resolve()` in this branch.
            return resolver.promise;
        }
        if (typeof importScripts === 'function') {
            // We're in a web worker
            if (isCss(chunkUrl)) {
            // ignore
            } else if (isJs(chunkUrl)) {
                self.TURBOPACK_NEXT_CHUNK_URLS.push(chunkUrl);
                try {
                    importScripts(chunkUrl);
                } catch (error) {
                    onChunkLoadError(sourceType, chunkUrl, resolver, error);
                }
            } else {
                throw new Error(`can't infer type of chunk from URL ${chunkUrl} in worker`);
            }
        } else {
            // TODO(PACK-2140): remove this once all filenames are guaranteed to be escaped.
            var decodedChunkUrl = decodeURI(chunkUrl);
            if (isCss(chunkUrl)) {
                var previousLinks = document.querySelectorAll(`link[rel=stylesheet][href="${chunkUrl}"],link[rel=stylesheet][href^="${chunkUrl}?"],link[rel=stylesheet][href="${decodedChunkUrl}"],link[rel=stylesheet][href^="${decodedChunkUrl}?"]`);
                if (previousLinks.length > 0) {
                    // CSS chunks do not register themselves, and as such must be marked as
                    // loaded instantly.
                    resolver.resolve();
                } else {
                    var createLink = function createLink1() {
                        var link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.crossOrigin = CROSS_ORIGIN;
                        link.href = chunkUrl;
                        link.onerror = function() {
                            // Re-insert a fresh tag at the same position on retry to preserve
                            // cascade order.
                            var anchor = document.createComment('');
                            link.replaceWith(anchor);
                            onChunkLoadError(sourceType, chunkUrl, resolver, undefined, function() {
                                return anchor.replaceWith(createLink());
                            });
                        };
                        link.onload = function() {
                            // CSS chunks do not register themselves, and as such must be marked as
                            // loaded instantly.
                            resolver.resolve();
                        };
                        return link;
                    };
                    // Append to the `head` for webpack compatibility.
                    document.head.appendChild(createLink());
                }
            } else if (isJs(chunkUrl)) {
                var previousScripts = document.querySelectorAll(`script[src="${chunkUrl}"],script[src^="${chunkUrl}?"],script[src="${decodedChunkUrl}"],script[src^="${decodedChunkUrl}?"]`);
                if (previousScripts.length > 0) {
                    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        var _loop = function() {
                            var script = _step.value;
                            script.addEventListener('error', function() {
                                // Drop the failed tag so a retry can re-add it cleanly.
                                script.remove();
                                onChunkLoadError(sourceType, chunkUrl, resolver);
                            }, {
                                once: true
                            });
                        };
                        for(var _iterator = Array.from(previousScripts)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true)_loop();
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return != null) {
                                _iterator.return();
                            }
                        } finally{
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                } else {
                    var script = document.createElement('script');
                    script.crossOrigin = CROSS_ORIGIN;
                    script.src = chunkUrl;
                    // We'll only mark the chunk as loaded once the script has been executed,
                    // which happens in `registerChunk`. Hence the absence of `resolve()` in
                    // this branch.
                    script.onerror = function() {
                        // Drop the failed tag so a retry can re-add it cleanly.
                        script.remove();
                        onChunkLoadError(sourceType, chunkUrl, resolver);
                    };
                    // Append to the `head` for webpack compatibility.
                    document.head.appendChild(script);
                }
            } else {
                throw new Error(`can't infer type of chunk from URL ${chunkUrl}`);
            }
        }
        resolver.loadingStarted = true;
        return resolver.promise;
    }
})();
var chunksToRegister = globalThis["TURBOPACK"];
globalThis["TURBOPACK"] = { push: registerChunk };
chunksToRegister.forEach(registerChunk);
})();


//# sourceMappingURL=0_9x_turbopack-tests_tests_snapshot_swc_transforms_preset_env_input_index_04jskxh.js.map