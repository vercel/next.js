(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([
    "output/5c1d0_turbopack-tests_tests_snapshot_swc_transforms_preset_env_input_index_5aaf1327.js",
    {"otherChunks":["output/turbopack_crates_turbopack-tests_tests_snapshot_e54bacca._.js"],"runtimeModuleIds":["[project]/turbopack/crates/turbopack-tests/tests/snapshot/swc_transforms/preset_env/input/index.js [test] (ecmascript)"]}
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
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else {
        obj[key] = value;
    }
    return obj;
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
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
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
        // This is invoked when a module is merged into another module, thus it wasn't invoked via
        // instantiateModule and the cache entry wasn't created yet.
        module = createModuleObject(id);
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
var BindingTag_Value = 0;
/**
 * Adds the getters to the exports object.
 */ function esm(exports, bindings) {
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
    Object.seal(exports);
}
/**
 * Makes the module an ESM with exports
 */ function esmExport(bindings, id) {
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
    esm(exports, bindings);
}
contextPrototype.s = esmExport;
function ensureDynamicExports(module, exports) {
    var reexportedObjects = REEXPORTED_OBJECTS.get(module);
    if (!reexportedObjects) {
        REEXPORTED_OBJECTS.set(module, reexportedObjects = []);
        module.exports = module.namespaceObject = new Proxy(exports, {
            get: function get(target, prop) {
                if (hasOwnProperty.call(target, prop) || prop === 'default' || prop === '__esModule') {
                    return Reflect.get(target, prop);
                }
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = reexportedObjects[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var obj = _step.value;
                        var value = Reflect.get(obj, prop);
                        if (value !== undefined) return value;
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
                return undefined;
            },
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
 * `require.context` and require/import expression runtime.
 */ function moduleContext(map) {
    function moduleContext(id) {
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
function isPromise(maybePromise) {
    return maybePromise != null && (typeof maybePromise === "undefined" ? "undefined" : _type_of(maybePromise)) === 'object' && 'then' in maybePromise && typeof maybePromise.then === 'function';
}
function isAsyncModuleExt(obj) {
    return turbopackQueues in obj;
}
function createPromise() {
    var resolve;
    var reject;
    var promise = new Promise(function(res, rej) {
        reject = rej;
        resolve = res;
    });
    return {
        promise: promise,
        resolve: resolve,
        reject: reject
    };
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
        var moduleId = chunkModules[i];
        var end = i + 1;
        // Find our factory function
        while(end < chunkModules.length && typeof chunkModules[end] !== 'function'){
            end++;
        }
        if (end === chunkModules.length) {
            throw new Error('malformed chunk format, expected a factory function');
        }
        // Each chunk item has a 'primary id' and optional additional ids. If the primary id is already
        // present we know all the additional ids are also present, so we don't need to check.
        if (!moduleFactories.has(moduleId)) {
            var moduleFactoryFn = chunkModules[end];
            applyModuleFactoryName(moduleFactoryFn);
            newModuleId === null || newModuleId === void 0 ? void 0 : newModuleId(moduleId);
            for(; i < end; i++){
                moduleId = chunkModules[i];
                moduleFactories.set(moduleId, moduleFactoryFn);
            }
        }
        i = end + 1; // end is pointing at the last factory advance to the next id or the end of the array.
    }
}
// everything below is adapted from webpack
// https://github.com/webpack/webpack/blob/6be4065ade1e252c1d8dcba4af0f43e32af1bdc1/lib/runtime/AsyncModuleRuntimeModule.js#L13
var turbopackQueues = Symbol('turbopack queues');
var turbopackExports = Symbol('turbopack exports');
var turbopackError = Symbol('turbopack error');
function resolveQueue(queue) {
    if (queue && queue.status !== 1) {
        queue.status = 1;
        queue.forEach(function(fn) {
            return fn.queueCount--;
        });
        queue.forEach(function(fn) {
            return fn.queueCount-- ? fn.queueCount++ : fn();
        });
    }
}
function wrapDeps(deps) {
    return deps.map(function(dep) {
        if (dep !== null && (typeof dep === "undefined" ? "undefined" : _type_of(dep)) === 'object') {
            if (isAsyncModuleExt(dep)) return dep;
            if (isPromise(dep)) {
                var queue = Object.assign([], {
                    status: 0
                });
                var _obj;
                var obj = (_obj = {}, _define_property(_obj, turbopackExports, {}), _define_property(_obj, turbopackQueues, function(fn) {
                    return fn(queue);
                }), _obj);
                dep.then(function(res) {
                    obj[turbopackExports] = res;
                    resolveQueue(queue);
                }, function(err) {
                    obj[turbopackError] = err;
                    resolveQueue(queue);
                });
                return obj;
            }
        }
        var _obj1;
        return _obj1 = {}, _define_property(_obj1, turbopackExports, dep), _define_property(_obj1, turbopackQueues, function() {}), _obj1;
    });
}
function asyncModule(body, hasAwait) {
    var module = this.m;
    var queue = hasAwait ? Object.assign([], {
        status: -1
    }) : undefined;
    var depQueues = new Set();
    var _createPromise = createPromise(), resolve = _createPromise.resolve, reject = _createPromise.reject, rawPromise = _createPromise.promise;
    var _obj;
    var promise = Object.assign(rawPromise, (_obj = {}, _define_property(_obj, turbopackExports, module.exports), _define_property(_obj, turbopackQueues, function(fn) {
        queue && fn(queue);
        depQueues.forEach(fn);
        promise['catch'](function() {});
    }), _obj));
    var attributes = {
        get: function get() {
            return promise;
        },
        set: function set(v) {
            // Calling `esmExport` leads to this.
            if (v !== promise) {
                promise[turbopackExports] = v;
            }
        }
    };
    Object.defineProperty(module, 'exports', attributes);
    Object.defineProperty(module, 'namespaceObject', attributes);
    function handleAsyncDependencies(deps) {
        var currentDeps = wrapDeps(deps);
        var getResult = function() {
            return currentDeps.map(function(d) {
                if (d[turbopackError]) throw d[turbopackError];
                return d[turbopackExports];
            });
        };
        var _createPromise = createPromise(), promise = _createPromise.promise, resolve = _createPromise.resolve;
        var fn = Object.assign(function() {
            return resolve(getResult);
        }, {
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
        currentDeps.map(function(dep) {
            return dep[turbopackQueues](fnQueue);
        });
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
contextPrototype.a = asyncModule;
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
 * Turbopack *development* ECMAScript runtimes.
 *
 * It will be appended to the runtime code of each runtime right after the
 * shared runtime utils.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../base/globals.d.ts" />
/// <reference path="../../../shared/runtime-utils.ts" />
// Used in WebWorkers to tell the runtime about the chunk base path
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
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
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
var SourceType = /*#__PURE__*/ function(SourceType) {
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
var moduleFactories = new Map();
contextPrototype.M = moduleFactories;
var availableModules = new Map();
var availableModuleChunks = new Map();
function factoryNotAvailableMessage(moduleId, sourceType, sourceData) {
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
function loadChunk(chunkData) {
    return loadChunkInternal(1, this.m.id, chunkData);
}
browserContextPrototype.l = loadChunk;
function loadInitialChunk(chunkPath, chunkData) {
    return loadChunkInternal(0, chunkPath, chunkData);
}
function loadChunkInternal(sourceType, sourceData, chunkData) {
    return _async_to_generator(function() {
        var includedList, modulesPromises, includedModuleChunksList, moduleChunksPromises, promise, moduleChunksToLoad, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, moduleChunk, _iteratorNormalCompletion1, _didIteratorError1, _iteratorError1, _iterator1, _step1, moduleChunkToLoad, promise1, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, includedModuleChunk, _iteratorNormalCompletion3, _didIteratorError3, _iteratorError3, _iterator3, _step3, included;
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
                    includedModuleChunksList = chunkData.moduleChunks || [];
                    moduleChunksPromises = includedModuleChunksList.map(function(included) {
                        // TODO(alexkirsz) Do we need this check?
                        // if (moduleFactories[included]) return true;
                        return availableModuleChunks.get(included);
                    }).filter(function(p) {
                        return p;
                    });
                    if (!(moduleChunksPromises.length > 0)) return [
                        3,
                        5
                    ];
                    if (!(moduleChunksPromises.length === includedModuleChunksList.length)) return [
                        3,
                        4
                    ];
                    // When all included module chunks are already loaded or loading, we can skip loading ourselves
                    return [
                        4,
                        Promise.all(moduleChunksPromises)
                    ];
                case 3:
                    _state.sent();
                    return [
                        2
                    ];
                case 4:
                    moduleChunksToLoad = new Set();
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(_iterator = includedModuleChunksList[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            moduleChunk = _step.value;
                            if (!availableModuleChunks.has(moduleChunk)) {
                                moduleChunksToLoad.add(moduleChunk);
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
                    _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                    try {
                        for(_iterator1 = moduleChunksToLoad[Symbol.iterator](); !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                            moduleChunkToLoad = _step1.value;
                            promise1 = loadChunkPath(sourceType, sourceData, moduleChunkToLoad);
                            availableModuleChunks.set(moduleChunkToLoad, promise1);
                            moduleChunksPromises.push(promise1);
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
                    promise = Promise.all(moduleChunksPromises);
                    return [
                        3,
                        6
                    ];
                case 5:
                    promise = loadChunkPath(sourceType, sourceData, chunkData.path);
                    _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
                    try {
                        // Mark all included module chunks as loading if they are not already loaded or loading.
                        for(_iterator2 = includedModuleChunksList[Symbol.iterator](); !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true){
                            includedModuleChunk = _step2.value;
                            if (!availableModuleChunks.has(includedModuleChunk)) {
                                availableModuleChunks.set(includedModuleChunk, promise);
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
                    _state.label = 6;
                case 6:
                    _iteratorNormalCompletion3 = true, _didIteratorError3 = false, _iteratorError3 = undefined;
                    try {
                        for(_iterator3 = includedList[Symbol.iterator](); !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true){
                            included = _step3.value;
                            if (!availableModules.has(included)) {
                                // It might be better to race old and new promises, but it's rare that the new promise will be faster than a request started earlier.
                                // In production it's even more rare, because the chunk optimization tries to deduplicate modules anyway.
                                availableModules.set(included, promise);
                            }
                        }
                    } catch (err) {
                        _didIteratorError3 = true;
                        _iteratorError3 = err;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion3 && _iterator3.return != null) {
                                _iterator3.return();
                            }
                        } finally{
                            if (_didIteratorError3) {
                                throw _iteratorError3;
                            }
                        }
                    }
                    return [
                        4,
                        promise
                    ];
                case 7:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
}
var loadedChunk = Promise.resolve(undefined);
var instrumentedBackendLoadChunks = new WeakMap();
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrl(chunkUrl) {
    return loadChunkByUrlInternal(1, this.m.id, chunkUrl);
}
browserContextPrototype.L = loadChunkByUrl;
// Do not make this async. React relies on referential equality of the returned Promise.
function loadChunkByUrlInternal(sourceType, sourceData, chunkUrl) {
    var thenable = BACKEND.loadChunkCached(sourceType, chunkUrl);
    var entry = instrumentedBackendLoadChunks.get(thenable);
    if (entry === undefined) {
        var resolve = instrumentedBackendLoadChunks.set.bind(instrumentedBackendLoadChunks, thenable, loadedChunk);
        entry = thenable.then(resolve).catch(function(error) {
            var loadReason;
            switch(sourceType){
                case 0:
                    loadReason = `as a runtime dependency of chunk ${sourceData}`;
                    break;
                case 1:
                    loadReason = `from module ${sourceData}`;
                    break;
                case 2:
                    loadReason = 'from an HMR update';
                    break;
                default:
                    invariant(sourceType, function(sourceType) {
                        return `Unknown source type: ${sourceType}`;
                    });
            }
            throw new Error(`Failed to load chunk ${chunkUrl} ${loadReason}${error ? `: ${error}` : ''}`, error ? {
                cause: error
            } : undefined);
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
    var exported = this.r(moduleId);
    var _exported_default;
    return (_exported_default = exported === null || exported === void 0 ? void 0 : exported.default) !== null && _exported_default !== void 0 ? _exported_default : exported;
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
 * Returns a blob URL for the worker.
 * @param chunks list of chunks to load
 */ function getWorkerBlobURL(chunks) {
    // It is important to reverse the array so when bootstrapping we can infer what chunk is being
    // evaluated by poping urls off of this array.  See `getPathFromScript`
    var bootstrap = `self.TURBOPACK_WORKER_LOCATION = ${JSON.stringify(location.origin)};
self.TURBOPACK_NEXT_CHUNK_URLS = ${JSON.stringify(chunks.reverse().map(getChunkRelativeUrl), null, 2)};
importScripts(...self.TURBOPACK_NEXT_CHUNK_URLS.map(c => self.TURBOPACK_WORKER_LOCATION + c).reverse());`;
    var blob = new Blob([
        bootstrap
    ], {
        type: 'text/javascript'
    });
    return URL.createObjectURL(blob);
}
browserContextPrototype.b = getWorkerBlobURL;
/**
 * Instantiates a runtime module.
 */ function instantiateRuntimeModule(moduleId, chunkPath) {
    return instantiateModule(moduleId, 0, chunkPath);
}
/**
 * Returns the URL relative to the origin where a chunk can be fetched from.
 */ function getChunkRelativeUrl(chunkPath) {
    return `${CHUNK_BASE_PATH}${chunkPath.split('/').map(function(p) {
        return encodeURIComponent(p);
    }).join('/')}${CHUNK_SUFFIX_PATH}`;
}
function getPathFromScript(chunkScript) {
    if (typeof chunkScript === 'string') {
        return chunkScript;
    }
    var chunkUrl = typeof TURBOPACK_NEXT_CHUNK_URLS !== 'undefined' ? TURBOPACK_NEXT_CHUNK_URLS.pop() : chunkScript.getAttribute('src');
    var src = decodeURIComponent(chunkUrl.replace(/[?#].*$/, ''));
    var path = src.startsWith(CHUNK_BASE_PATH) ? src.slice(CHUNK_BASE_PATH.length) : src;
    return path;
}
var regexJsUrl = /\.js(?:\?[^#]*)?(?:#.*)?$/;
/**
 * Checks if a given path/URL ends with .js, optionally followed by ?query or #fragment.
 */ function isJs(chunkUrlOrPath) {
    return regexJsUrl.test(chunkUrlOrPath);
}
var regexCssUrl = /\.css(?:\?[^#]*)?(?:#.*)?$/;
/**
 * Checks if a given path/URL ends with .css, optionally followed by ?query or #fragment.
 */ function isCss(chunkUrl) {
    return regexCssUrl.test(chunkUrl);
}
function loadWebAssembly(chunkPath, edgeModule, importsObj) {
    return BACKEND.loadWebAssembly(1, this.m.id, chunkPath, edgeModule, importsObj);
}
contextPrototype.w = loadWebAssembly;
function loadWebAssemblyModule(chunkPath, edgeModule) {
    return BACKEND.loadWebAssemblyModule(1, this.m.id, chunkPath, edgeModule);
}
contextPrototype.u = loadWebAssemblyModule;
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
var getOrInstantiateModuleFromParent = function(id, sourceModule) {
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
    var chunkPath = getPathFromScript(registration[0]);
    var runtimeParams;
    // When bootstrapping we are passed a single runtimeParams object so we can distinguish purely based on length
    if (registration.length === 2) {
        runtimeParams = registration[1];
    } else {
        runtimeParams = undefined;
        installCompressedModuleFactories(registration, /* offset= */ 1, moduleFactories);
    }
    return BACKEND.registerChunk(chunkPath, runtimeParams);
}
/**
 * This file contains the runtime code specific to the Turbopack development
 * ECMAScript DOM runtime.
 *
 * It will be appended to the base development runtime code.
 */ /* eslint-disable @typescript-eslint/no-unused-vars */ /// <reference path="../../../browser/runtime/base/runtime-base.ts" />
/// <reference path="../../../shared/runtime-types.d.ts" />
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
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
        return this;
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
var BACKEND;
/**
 * Maps chunk paths to the corresponding resolver.
 */ var chunkResolvers = new Map();
(function() {
    BACKEND = {
        registerChunk: function registerChunk(chunkPath, params) {
            return _async_to_generator(function() {
                var chunkUrl, resolver, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, otherChunkData, otherChunkPath, otherChunkUrl, _iteratorNormalCompletion1, _didIteratorError1, _iteratorError1, _iterator1, _step1, moduleId;
                return _ts_generator(this, function(_state) {
                    switch(_state.label){
                        case 0:
                            chunkUrl = getChunkRelativeUrl(chunkPath);
                            resolver = getOrCreateResolver(chunkUrl);
                            resolver.resolve();
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
        },
        loadWebAssembly: function loadWebAssembly(_sourceType, _sourceData, wasmChunkPath, _edgeModule, importsObj) {
            return _async_to_generator(function() {
                var req, instance;
                return _ts_generator(this, function(_state) {
                    switch(_state.label){
                        case 0:
                            req = fetchWebAssembly(wasmChunkPath);
                            return [
                                4,
                                WebAssembly.instantiateStreaming(req, importsObj)
                            ];
                        case 1:
                            instance = _state.sent().instance;
                            return [
                                2,
                                instance.exports
                            ];
                    }
                });
            })();
        },
        loadWebAssemblyModule: function loadWebAssemblyModule(_sourceType, _sourceData, wasmChunkPath, _edgeModule) {
            return _async_to_generator(function() {
                var req;
                return _ts_generator(this, function(_state) {
                    switch(_state.label){
                        case 0:
                            req = fetchWebAssembly(wasmChunkPath);
                            return [
                                4,
                                WebAssembly.compileStreaming(req)
                            ];
                        case 1:
                            return [
                                2,
                                _state.sent()
                            ];
                    }
                });
            })();
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
                promise: promise,
                resolve: function() {
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
                importScripts(TURBOPACK_WORKER_LOCATION + chunkUrl);
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
                    var link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = chunkUrl;
                    link.onerror = function() {
                        resolver.reject();
                    };
                    link.onload = function() {
                        // CSS chunks do not register themselves, and as such must be marked as
                        // loaded instantly.
                        resolver.resolve();
                    };
                    // Append to the `head` for webpack compatibility.
                    document.head.appendChild(link);
                }
            } else if (isJs(chunkUrl)) {
                var previousScripts = document.querySelectorAll(`script[src="${chunkUrl}"],script[src^="${chunkUrl}?"],script[src="${decodedChunkUrl}"],script[src^="${decodedChunkUrl}?"]`);
                if (previousScripts.length > 0) {
                    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        // There is this edge where the script already failed loading, but we
                        // can't detect that. The Promise will never resolve in this case.
                        for(var _iterator = Array.from(previousScripts)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            var script = _step.value;
                            script.addEventListener('error', function() {
                                resolver.reject();
                            });
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
                } else {
                    var script1 = document.createElement('script');
                    script1.src = chunkUrl;
                    // We'll only mark the chunk as loaded once the script has been executed,
                    // which happens in `registerChunk`. Hence the absence of `resolve()` in
                    // this branch.
                    script1.onerror = function() {
                        resolver.reject();
                    };
                    // Append to the `head` for webpack compatibility.
                    document.head.appendChild(script1);
                }
            } else {
                throw new Error(`can't infer type of chunk from URL ${chunkUrl}`);
            }
        }
        resolver.loadingStarted = true;
        return resolver.promise;
    }
    function fetchWebAssembly(wasmChunkPath) {
        return fetch(getChunkRelativeUrl(wasmChunkPath));
    }
})();
const chunksToRegister = globalThis.TURBOPACK;
globalThis.TURBOPACK = { push: registerChunk };
chunksToRegister.forEach(registerChunk);
})();


//# sourceMappingURL=780ce_turbopack-tests_tests_snapshot_swc_transforms_preset_env_input_index_5aaf1327.js.map