/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */

/* eslint-disable @next/next/no-assign-module-variable */

/// <reference path="./runtime-types.d.ts" />

interface Exports {
  __esModule?: boolean;

  [key: string]: any;
}
type EsmNamespaceObject = Record<string, any>;

const REEXPORTED_OBJECTS = Symbol("reexported objects");

interface BaseModule {
  exports: Exports;
  error: Error | undefined;
  loaded: boolean;
  id: ModuleId;
  children: ModuleId[];
  parents: ModuleId[];
  namespaceObject?: EsmNamespaceObject;
  [REEXPORTED_OBJECTS]?: any[];
}

interface Module extends BaseModule {}

type RequireContextMap = Record<ModuleId, RequireContextEntry>;

interface RequireContextEntry {
  id: () => ModuleId;
}

interface RequireContext {
  (moduleId: ModuleId): Exports | EsmNamespaceObject;
  keys(): ModuleId[];
  resolve(moduleId: ModuleId): ModuleId;
}

type GetOrInstantiateModuleFromParent = (
  moduleId: ModuleId,
  parentModule: Module
) => Module;

type CommonJsRequireContext = (
  entry: RequireContextEntry,
  parentModule: Module
) => Exports;

const hasOwnProperty = Object.prototype.hasOwnProperty;
const toStringTag = typeof Symbol !== "undefined" && Symbol.toStringTag;

function defineProp(
  obj: any,
  name: PropertyKey,
  options: PropertyDescriptor & ThisType<any>
) {
  if (!hasOwnProperty.call(obj, name))
    Object.defineProperty(obj, name, options);
}

/**
 * Adds the getters to the exports object.
 */
function esm(exports: Exports, getters: Record<string, () => any>) {
  defineProp(exports, "__esModule", { value: true });
  if (toStringTag) defineProp(exports, toStringTag, { value: "Module" });
  for (const key in getters) {
    defineProp(exports, key, { get: getters[key], enumerable: true });
  }
}

/**
 * Makes the module an ESM with exports
 */
function esmExport(module: Module, getters: Record<string, () => any>) {
  esm((module.namespaceObject = module.exports), getters);
}

/**
 * Dynamically exports properties from an object
 */
function dynamicExport(module: Module, object: Record<string, any>) {
  let reexportedObjects = module[REEXPORTED_OBJECTS];
  if (!reexportedObjects) {
    reexportedObjects = module[REEXPORTED_OBJECTS] = [];
    module.namespaceObject = new Proxy(module.exports, {
      get(target, prop) {
        if (
          hasOwnProperty.call(target, prop) ||
          prop === "default" ||
          prop === "__esModule"
        ) {
          return Reflect.get(target, prop);
        }
        for (const obj of reexportedObjects!) {
          const value = Reflect.get(obj, prop);
          if (value !== undefined) return value;
        }
        return undefined;
      },
      ownKeys(target) {
        const keys = Reflect.ownKeys(target);
        for (const obj of reexportedObjects!) {
          for (const key of Reflect.ownKeys(obj)) {
            if (key !== "default" && !keys.includes(key)) keys.push(key);
          }
        }
        return keys;
      },
    });
  }
  reexportedObjects.push(object);
}

function exportValue(module: Module, value: any) {
  module.exports = value;
}

function exportNamespace(module: Module, namespace: any) {
  module.exports = module.namespaceObject = namespace;
}

function createGetter(obj: Record<string, any>, key: string) {
  return () => obj[key];
}

/**
 * @returns prototype of the object
 */
const getProto: (obj: any) => any = Object.getPrototypeOf
  ? (obj) => Object.getPrototypeOf(obj)
  : (obj) => obj.__proto__;

/** Prototypes that are not expanded for exports */
const LEAF_PROTOTYPES = [null, getProto({}), getProto([]), getProto(getProto)];

/**
 * @param allowExportDefault
 *   * `false`: will have the raw module as default export
 *   * `true`: will have the default property as default export
 */
function interopEsm(
  raw: Exports,
  ns: EsmNamespaceObject,
  allowExportDefault?: boolean
) {
  const getters: { [s: string]: () => any } = Object.create(null);
  for (
    let current = raw;
    (typeof current === "object" || typeof current === "function") &&
    !LEAF_PROTOTYPES.includes(current);
    current = getProto(current)
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      getters[key] = createGetter(raw, key);
    }
  }
  if (!(allowExportDefault && "default" in getters)) {
    getters["default"] = () => raw;
  }
  esm(ns, getters);
}

function esmImport(sourceModule: Module, id: ModuleId): EsmNamespaceObject {
  const module = getOrInstantiateModuleFromParent(id, sourceModule);
  if (module.error) throw module.error;
  if (module.namespaceObject) return module.namespaceObject;
  const raw = module.exports;
  const ns = (module.namespaceObject = {});
  interopEsm(raw, ns, raw.__esModule);
  return ns;
}

function commonJsRequire(sourceModule: Module, id: ModuleId): Exports {
  const module = getOrInstantiateModuleFromParent(id, sourceModule);
  if (module.error) throw module.error;
  return module.exports;
}

type RequireContextFactory = (map: RequireContextMap) => RequireContext;

function requireContext(
  sourceModule: Module,
  map: RequireContextMap
): RequireContext {
  function requireContext(id: ModuleId): Exports {
    const entry = map[id];

    if (!entry) {
      throw new Error(
        `module ${id} is required from a require.context, but is not in the context`
      );
    }

    return commonJsRequireContext(entry, sourceModule);
  }

  requireContext.keys = (): ModuleId[] => {
    return Object.keys(map);
  };

  requireContext.resolve = (id: ModuleId): ModuleId => {
    const entry = map[id];

    if (!entry) {
      throw new Error(
        `module ${id} is resolved from a require.context, but is not in the context`
      );
    }

    return entry.id();
  };

  return requireContext;
}

/**
 * Returns the path of a chunk defined by its data.
 */
function getChunkPath(chunkData: ChunkData): ChunkPath {
  return typeof chunkData === "string" ? chunkData : chunkData.path;
}
