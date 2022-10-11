(self.TURBOPACK = self.TURBOPACK || []).push(["[workspace]/crates/turbopack/tests/snapshot/integration/preset_env/output/crates_turbopack_tests_snapshot_integration_preset_env_input_index.js.eval.js", {

"[project]/crates/turbopack/tests/snapshot/integration/preset_env/input/index.js (ecmascript)": (({ r: __turbopack_require__, i: __turbopack_import__, s: __turbopack_esm__, v: __turbopack_export_value__, c: __turbopack_cache__, l: __turbopack_load__, p: process, m: module, e: exports }) => (() => {

var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$swc$2b$helpers$40$0$2e$4$2e$11$2f$node_modules$2f40$swc$2f$helpers$2f$src$2f$_class_call_check$2e$mjs__ = __turbopack_import__("[project]/node_modules/.pnpm/@swc+helpers@0.4.11/node_modules/@swc/helpers/src/_class_call_check.mjs (ecmascript)");
"__TURBOPACK__ecmascript__hoisting__location__";
;
var Foo = function Foo() {
    "use strict";
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$swc$2b$helpers$40$0$2e$4$2e$11$2f$node_modules$2f40$swc$2f$helpers$2f$src$2f$_class_call_check$2e$mjs__["default"](this, Foo);
};
console.log(Foo);

})()),
}, ({ chunks, instantiateRuntimeModule }) => {
    if(!(true && chunks.has("[workspace]/crates/turbopack/tests/snapshot/integration/preset_env/output/node_modules_.pnpm_@swc+helpers@0.4.11_node_modules_@swc_helpers_src__class_call_check.mjs.js"))) return true;
    instantiateRuntimeModule("[project]/crates/turbopack/tests/snapshot/integration/preset_env/input/index.js (ecmascript)");
}]);
(() => {
  // When a chunk is executed, it will either register itself with the current
  // instance of the runtime, or it will push itself onto the list of pending
  // chunks (`self.TURBOPACK`).
  //
  // When the runtime executes, it will pick up and register all pending chunks,
  // and replace the list of pending chunks with itself so later chunks can
  // register directly with it.
  if (!Array.isArray(self.TURBOPACK)) {
    return;
  }

  var chunksToRegister = self.TURBOPACK;
  var chunks = new Set();
  var runnable = [];
  var moduleFactories = { __proto__: null };
  var moduleCache = { __proto__: null };
  var loading = { __proto__: null };
  /**
   * Maps module IDs to persisted data between executions of their hot module
   * implementation (`hot.data`).
   */
  const moduleHotData = new Map();
  /**
   * Maps module instances to their hot module state.
   */
  const moduleHotState = new Map();
  /**
   * Module IDs that are instantiated as part of the runtime of a chunk.
   */
  const runtimeModules = new Set();
  /**
   * Map from module ID to the chunks that contain this module.
   *
   * In HMR, we need to keep track of which modules are contained in which so
   * chunks. This is so we don't eagerly dispose of a module when it is removed
   * from chunk A, but still exists in chunk B.
   */
  const moduleChunksMap = new Map();
  var hOP = Object.prototype.hasOwnProperty;
  var _process = typeof process !== "undefined" ? process : { env: {} };

  var toStringTag = typeof Symbol !== "undefined" && Symbol.toStringTag;

  function defineProp(obj, name, options) {
    if (!hOP.call(obj, name)) Object.defineProperty(obj, name, options);
  }

  function esm(exports, getters) {
    defineProp(exports, "__esModule", { value: true });
    if (toStringTag) defineProp(exports, toStringTag, { value: "Module" });
    for (var key in getters) {
      defineProp(exports, key, { get: getters[key], enumerable: true });
    }
  }

  function exportValue(module, value) {
    module.exports = value;
  }

  function createGetter(obj, key) {
    return () => obj[key];
  }

  function interopEsm(raw, ns, allowExportDefault) {
    var getters = { __proto__: null };
    if (typeof raw === "object") {
      for (var key in raw) {
        getters[key] = createGetter(raw, key);
      }
    }
    if (!(allowExportDefault && "default" in getters)) {
      getters["default"] = () => raw;
    }
    esm(ns, getters);
  }

  function esmImport(sourceModule, id, allowExportDefault) {
    const module = getOrInstantiateModuleFromParent(id, sourceModule);
    var raw = module.exports;
    if (raw.__esModule) return raw;
    if (module.interopNamespace) return module.interopNamespace;
    var ns = (module.interopNamespace = {});
    interopEsm(raw, ns, allowExportDefault);
    return ns;
  }

  function commonJsRequire(sourceModule, id) {
    return getOrInstantiateModuleFromParent(id, sourceModule).exports;
  }

  function loadFile(id, path) {
    if (chunks.has(id)) return Promise.resolve();
    if (loading[id]) return loading[id].promise;

    var load = (loading[id] = {});
    load.promise = new Promise((resolve, reject) => {
      load.resolve = resolve;
      load.reject = reject;
    }).catch((ev) => {
      delete loading[id];
      throw ev;
    });

    var script = document.createElement("script");
    script.src = path;
    script.onerror = load.reject;
    document.body.appendChild(script);
    return load.promise;
  }

  // TODO(alexkirsz) Use a TS enum.
  /**
   * The module was instantiated because it was included in an evaluated chunk's
   * runtime.
   */
  const SOURCE_TYPE_RUNTIME = 0;
  /**
   * The module was instantiated because a parent module imported it.
   */
  const SOURCE_TYPE_PARENT = 1;
  /**
   * The module was instantiated because it was included in a chunk's hot module
   * update.
   */
  const SOURCE_TYPE_UPDATE = 2;
  function instantiateModule(id, sourceType, sourceId) {
    const moduleFactory = moduleFactories[id];
    if (typeof moduleFactory !== "function") {
      // This can happen if modules incorrectly handle HMR disposes/updates,
      // e.g. when they keep a `setTimeout` around which still executes old code
      // and contains e.g. a `require("something")` call.
      let instantiationReason;
      switch (sourceType) {
        case SOURCE_TYPE_RUNTIME:
          instantiationReason = "as a runtime entry";
          break;
        case SOURCE_TYPE_PARENT:
          instantiationReason = `because it was required from module ${sourceId}`;
          break;
        case SOURCE_TYPE_UPDATE:
          instantiationReason = "because of an HMR update";
          break;
      }
      throw new Error(
        `Module ${id} was instantiated ${instantiationReason}, but the module factory is not available. It might have been deleted in an HMR update.`
      );
    }

    const hotData = moduleHotData.get(id);
    const { hot, hotState } = createModuleHot(hotData);

    const module = {
      exports: {},
      loaded: false,
      id,
      parents: [],
      children: [],
      interopNamespace: undefined,
      hot,
    };
    moduleCache[id] = module;
    moduleHotState.set(module, hotState);

    if (sourceType === SOURCE_TYPE_RUNTIME) {
      runtimeModules.add(id);
    } else if (sourceType === SOURCE_TYPE_PARENT) {
      module.parents.push(sourceId);

      // No need to add this module as a child of the parent module here, this
      // has already been taken care of in `getOrInstantiateModuleFromParent`.
    }

    runModuleExecutionHooks(module, () => {
      moduleFactory.call(module.exports, {
        e: module.exports,
        r: commonJsRequire.bind(null, module),
        i: esmImport.bind(null, module),
        s: esm.bind(null, module.exports),
        v: exportValue.bind(null, module),
        m: module,
        c: moduleCache,
        l: loadFile,
        p: _process,
      });
    });

    module.loaded = true;
    if (module.interopNamespace) {
      // in case of a circular dependency: cjs1 -> esm2 -> cjs1
      interopEsm(module.exports, module.interopNamespace);
    }

    return module;
  }

  // NOTE(alexkirsz) Webpack has an "module execution" interception hook that
  // Next.js' React Refresh runtime hooks into to add module context to the
  // refresh registry.
  function runModuleExecutionHooks(module, executeModule) {
    let cleanupReactRefreshIntercept =
      typeof self.$RefreshInterceptModuleExecution$ === "function"
        ? self.$RefreshInterceptModuleExecution$(module.id)
        : () => {};

    executeModule();

    if ("$RefreshHelpers$" in self) {
      // This pattern can also be used to register the exports of
      // a module with the React Refresh runtime.
      registerExportsAndSetupBoundaryForReactRefresh(module, self.$RefreshHelpers$);
    }

    cleanupReactRefreshIntercept();
  }

  /**
   * Retrieves a module from the cache, or instantiate it if it is not cached.
   */
  function getOrInstantiateModuleFromParent(id, sourceModule) {
    if (!sourceModule.hot.active) {
      console.warn(
        `Unexpected import of module ${id} from module ${sourceModule.id}, which was deleted by an HMR update`
      );
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

    return instantiateModule(id, SOURCE_TYPE_PARENT, sourceModule.id);
  }

  // This is adapted from https://github.com/vercel/next.js/blob/3466862d9dc9c8bb3131712134d38757b918d1c0/packages/react-refresh-utils/internal/ReactRefreshModule.runtime.ts
  function registerExportsAndSetupBoundaryForReactRefresh(module, helpers) {
    const currentExports = module.exports;
    const prevExports = module.hot.data.prevExports ?? null;

    helpers.registerExportsForReactRefresh(currentExports, module.id);

    // A module can be accepted automatically based on its exports, e.g. when
    // it is a Refresh Boundary.
    if (helpers.isReactRefreshBoundary(currentExports)) {
      // Save the previous exports on update so we can compare the boundary
      // signatures.
      module.hot.dispose((data) => {
        data.prevExports = currentExports;
      });
      // Unconditionally accept an update to this module, we'll check if it's
      // still a Refresh Boundary later.
      module.hot.accept();

      // This field is set when the previous version of this module was a
      // Refresh Boundary, letting us know we need to check for invalidation or
      // enqueue an update.
      if (prevExports !== null) {
        // A boundary can become ineligible if its exports are incompatible
        // with the previous exports.
        //
        // For example, if you add/remove/change exports, we'll want to
        // re-execute the importing modules, and force those components to
        // re-render. Similarly, if you convert a class component to a
        // function, we want to invalidate the boundary.
        if (helpers.shouldInvalidateReactRefreshBoundary(prevExports, currentExports)) {
          module.hot.invalidate();
        } else {
          helpers.scheduleUpdate();
        }
      }
    } else {
      // Since we just executed the code for the module, it's possible that the
      // new exports made it ineligible for being a boundary.
      // We only care about the case when we were _previously_ a boundary,
      // because we already accepted this update (accidental side effect).
      const isNoLongerABoundary = prevExports !== null;
      if (isNoLongerABoundary) {
        module.hot.invalidate();
      }
    }
  }

  function formatDependencyChain(dependencyChain) {
    return `Dependency chain: ${dependencyChain.join(" -> ")}`;
  }

  function _eval(factory) {
    let code = factory.code;
    if (factory.map) code += `\n\n//# sourceMappingURL=${factory.map}`;
    return eval(code);
  }

  function computeOutdatedModules(update) {
    const outdatedModules = new Set();
    const newModuleFactories = new Map();

    for (const [moduleId, factory] of Object.entries(update.added)) {
      newModuleFactories.set(moduleId, _eval(factory));
    }

    for (const [moduleId, factory] of Object.entries(update.modified)) {
      const effect = getAffectedModuleEffects(moduleId);

      switch (effect.type) {
        case "unaccepted":
          throw new Error(`cannot apply update: unaccepted module. ${formatDependencyChain(effect.dependencyChain)}.`);
        case "self-declined":
          throw new Error(
            `cannot apply update: self-declined module. ${formatDependencyChain(effect.dependencyChain)}.`
          );
        case "accepted":
          newModuleFactories.set(moduleId, _eval(factory));
          for (const outdatedModuleId of effect.outdatedModules) {
            outdatedModules.add(outdatedModuleId);
          }
          break;
        // TODO(alexkirsz) Dependencies: handle dependencies effects.
      }
    }

    return { outdatedModules, newModuleFactories };
  }

  function computeOutdatedSelfAcceptedModules(outdatedModules) {
    const outdatedSelfAcceptedModules = [];
    for (const moduleId of outdatedModules) {
      const module = moduleCache[moduleId];
      const hotState = moduleHotState.get(module);
      if (module && hotState.selfAccepted && !hotState.selfInvalidated) {
        outdatedSelfAcceptedModules.push({
          moduleId,
          errorHandler: hotState.selfAccepted,
        });
      }
    }
    return outdatedSelfAcceptedModules;
  }

  function disposePhase(chunkId, outdatedModules, deletedModules) {
    for (const moduleId of outdatedModules) {
      const module = moduleCache[moduleId];
      if (!module) {
        continue;
      }

      const data = disposeModule(module);

      moduleHotData.set(moduleId, data);
    }

    for (const moduleId of deletedModules) {
      const module = moduleCache[moduleId];
      if (!module) {
        continue;
      }

      const noRemainingChunks = removeModuleFromChunk(moduleId, chunkId);

      if (noRemainingChunks) {
        disposeModule(module);

        moduleHotData.delete(moduleId);
      }
    }

    // TODO(alexkirsz) Dependencies: remove outdated dependency from module
    // children.
  }

  /**
   * Disposes of an instance of a module.
   *
   * Returns the persistent hot data that should be kept for the next module
   * instance.
   */
  function disposeModule(module) {
    const hotState = moduleHotState.get(module);
    const data = {};

    // Run the `hot.dispose` handler, if any, passing in the persistent
    // `hot.data` object.
    for (const disposeHandler of hotState.disposeHandlers) {
      disposeHandler(data);
    }

    // This used to warn in `getOrInstantiateModuleFromParent` when a disposed
    // module is still importing other modules.
    module.hot.active = false;

    delete moduleCache[module.id];
    moduleHotState.delete(module);

    // TODO(alexkirsz) Dependencies: delete the module from outdated deps.

    // Remove the disposed module from its children's parents list.
    // It will be added back once the module re-instantiates and imports its
    // children again.
    for (const childId of module.children) {
      const child = moduleCache[childId];
      if (!child) {
        continue;
      }

      const idx = child.parents.indexOf(module.id);
      if (idx >= 0) {
        child.parents.splice(idx, 1);
      }
    }

    return data;
  }

  function applyPhase(chunkId, outdatedSelfAcceptedModules, newModuleFactories) {
    // Update module factories.
    for (const [moduleId, factory] of newModuleFactories.entries()) {
      moduleFactories[moduleId] = factory;
      addModuleToChunk(moduleId, chunkId);
    }

    // TODO(alexkirsz) Run new runtime entries here.

    // TODO(alexkirsz) Dependencies: call accept handlers for outdated deps.

    // Re-instantiate all outdated self-accepted modules.
    for (const { moduleId, errorHandler } of outdatedSelfAcceptedModules) {
      try {
        instantiateModule(moduleId, SOURCE_TYPE_UPDATE);
      } catch (err1) {
        if (typeof errorHandler === "function") {
          try {
            errorHandler(err1, { moduleId, module: moduleCache[moduleId] });
          } catch (err2) {
            // Ignore error.
          }
        }
      }
    }
  }

  function applyUpdate(chunkId, update) {
    const { outdatedModules, newModuleFactories } = computeOutdatedModules(update);

    const deletedModules = new Set(update.deleted);

    const outdatedSelfAcceptedModules = computeOutdatedSelfAcceptedModules(outdatedModules);

    disposePhase(chunkId, outdatedModules, deletedModules);
    applyPhase(chunkId, outdatedSelfAcceptedModules, newModuleFactories);
  }

  function getAffectedModuleEffects(moduleId) {
    const outdatedModules = new Set();

    const queue = [
      {
        moduleId,
        dependencyChain: [],
      },
    ];

    while (queue.length > 0) {
      const { moduleId, dependencyChain } = queue.shift();
      outdatedModules.add(moduleId);

      // We've arrived at the runtime of the chunk, which means that nothing
      // else above can accept this update.
      if (moduleId === null) {
        return {
          type: "unaccepted",
          dependencyChain,
          moduleId,
        };
      }

      const module = moduleCache[moduleId];
      const hotState = moduleHotState.get(module);

      if (
        // The module is not in the cache. Since this is a "modified" update,
        // it means that the module was never instantiated before.
        !module ||
        // The module accepted itself without invalidating itself.
        // TODO is that right?
        (hotState.selfAccepted && !hotState.selfInvalidated)
      ) {
        continue;
      }

      if (hotState.selfDeclined) {
        return {
          type: "self-declined",
          dependencyChain,
          moduleId,
        };
      }

      if (runtimeModules.has(moduleId)) {
        queue.push({
          moduleId: null,
          dependencyChain: [...dependencyChain, moduleId],
        });
        continue;
      }

      for (const parentId of module.parents) {
        const parent = moduleCache[parentId];

        if (!parent) {
          // TODO(alexkirsz) Is this even possible?
          continue;
        }

        // TODO(alexkirsz) Dependencies: check accepted and declined
        // dependencies here.

        queue.push({
          moduleId: parentId,
          dependencyChain: [...dependencyChain, moduleId],
        });
      }
    }

    return {
      type: "accepted",
      moduleId,
      outdatedModules,
    };
  }

  function createModuleHot(hotData) {
    const hotState = {
      selfAccepted: false,
      selfDeclined: false,
      selfInvalidated: false,
      disposeHandlers: [],
    };

    const hot = {
      // TODO(alexkirsz) This is not defined in the HMR API. It was used to
      // decide whether to warn whenever an HMR-disposed module required other
      // modules. We might want to remove it.
      active: true,

      data: hotData ?? {},

      // TODO(alexkirsz) Support full (dep, callback, errorHandler) form.
      accept: (dep, _callback, _errorHandler) => {
        if (dep === undefined) {
          hotState.selfAccepted = true;
        } else if (typeof dep === "function") {
          hotState.selfAccepted = dep;
        } else {
          throw new Error("unsupported `accept` signature");
        }
      },

      decline: (dep) => {
        if (dep === undefined) {
          hotState.selfDeclined = true;
        } else {
          throw new Error("unsupported `decline` signature");
        }
      },

      dispose: (callback) => {
        hotState.disposeHandlers.push(callback);
      },

      addDisposeHandler: (callback) => {
        hotState.disposeHandlers.push(callback);
      },

      removeDisposeHandler: (callback) => {
        const idx = hotState.disposeHandlers.indexOf(callback);
        if (idx >= 0) {
          hotState.disposeHandlers.splice(idx, 1);
        }
      },

      invalidate: () => {
        hotState.selfInvalidated = true;
        // TODO(alexkirsz) The original HMR code had management-related code
        // here.
      },

      // NOTE(alexkirsz) This is part of the management API, which we don't
      // implement, but the Next.js React Refresh runtime uses this to decide
      // whether to schedule an update.
      status: () => "idle",
    };

    return { hot, hotState };
  }

  /**
   * Adds a module to a chunk.
   */
  function addModuleToChunk(moduleId, chunkId) {
    let moduleChunks = moduleChunksMap.get(moduleId);
    if (!moduleChunks) {
      moduleChunks = new Set([chunkId]);
      moduleChunksMap.set(moduleId, moduleChunks);
    } else {
      moduleChunks.add(chunkId);
    }
  }

  /**
   * Removes a module from a chunk. Returns true there are no remaining chunks
   * including this module.
   */
  function removeModuleFromChunk(moduleId, chunkId) {
    const moduleChunks = moduleChunksMap.get(moduleId);
    moduleChunks.delete(chunkId);

    if (moduleChunks.size > 0) {
      return false;
    }

    moduleChunksMap.delete(moduleId);
    return true;
  }

  /**
   * Instantiates a runtime module.
   */
  function instantiateRuntimeModule(moduleId) {
    return instantiateModule(moduleId, SOURCE_TYPE_RUNTIME);
  }

  /**
   * Subscribes to chunk updates from the update server and applies them.
   */
  function subscribeToChunkUpdates(chunkId) {
    // This adds a chunk update listener once the handler code has been loaded
    self.TURBOPACK_CHUNK_UPDATE_LISTENERS.push([
      chunkId,
      (updateType, instruction) => {
        switch (updateType) {
          case "partial":
            applyUpdate(chunkId, JSON.parse(instruction));
            break;
          case "restart":
            self.location.reload();
            break;
          default:
            throw new Error(`Unknown update type: ${updateType}`);
        }
      },
    ]);
  }

  var runtime = {
    chunks,
    modules: moduleFactories,
    cache: moduleCache,
    instantiateRuntimeModule,
  };
  function registerChunk([chunkId, chunkModules, ...run]) {
    chunks.add(chunkId);
    if (loading[chunkId]) {
      loading[chunkId].resolve();
      delete loading[chunkId];
    }
    subscribeToChunkUpdates(chunkId);
    for (const [moduleId, moduleFactory] of Object.entries(chunkModules)) {
      if (!moduleFactories[moduleId]) {
        moduleFactories[moduleId] = moduleFactory;
      }
      addModuleToChunk(moduleId, chunkId);
    }
    runnable.push(...run);
    runnable = runnable.filter((r) => r(runtime));
  }
  self.TURBOPACK_CHUNK_UPDATE_LISTENERS = self.TURBOPACK_CHUNK_UPDATE_LISTENERS || [];
  self.TURBOPACK = { push: registerChunk };
  chunksToRegister.forEach(registerChunk);
})();


//# sourceMappingURL=crates_turbopack_tests_snapshot_integration_preset_env_input_index.js.eval.js.75922ac6993c41e9.map