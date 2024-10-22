/**
 * This file contains runtime types and functions that are shared between all
 * TurboPack ECMAScript runtimes.
 *
 * It will be prepended to the runtime code of each runtime.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="./runtime-types.d.ts" />

type EsmNamespaceObject = Record<string, any>;

// @ts-ignore Defined in `dev-base.ts`
declare function getOrInstantiateModuleFromParent<M>(
  id: ModuleId,
  sourceModule: M
): M;

const REEXPORTED_OBJECTS = Symbol("reexported objects");

type ModuleContextMap = Record<ModuleId, ModuleContextEntry>;

interface ModuleContextEntry {
  id: () => ModuleId;
  module: () => any;
}

interface ModuleContext {
  // require call
  (moduleId: ModuleId): Exports | EsmNamespaceObject;

  // async import call
  import(moduleId: ModuleId): Promise<Exports | EsmNamespaceObject>;

  keys(): ModuleId[];

  resolve(moduleId: ModuleId): ModuleId;
}

type GetOrInstantiateModuleFromParent<M> = (
  moduleId: ModuleId,
  parentModule: M
) => M;

declare function getOrInstantiateRuntimeModule(moduleId: ModuleId, chunkPath: ChunkPath): Module;

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
function esm(
  exports: Exports,
  getters: Record<string, (() => any) | [() => any, (v: any) => void]>
) {
  defineProp(exports, "__esModule", { value: true });
  if (toStringTag) defineProp(exports, toStringTag, { value: "Module" });
  for (const key in getters) {
    const item = getters[key];
    if (Array.isArray(item)) {
      defineProp(exports, key, {
        get: item[0],
        set: item[1],
        enumerable: true,
      });
    } else {
      defineProp(exports, key, { get: item, enumerable: true });
    }
  }
  Object.seal(exports);
}

/**
 * Makes the module an ESM with exports
 */
function esmExport(
  module: Module,
  exports: Exports,
  getters: Record<string, () => any>
) {
  module.namespaceObject = module.exports;
  esm(exports, getters);
}

function ensureDynamicExports(module: Module, exports: Exports) {
  let reexportedObjects = module[REEXPORTED_OBJECTS];

  if (!reexportedObjects) {
    reexportedObjects = module[REEXPORTED_OBJECTS] = [];
    module.exports = module.namespaceObject = new Proxy(exports, {
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
}

/**
 * Dynamically exports properties from an object
 */
function dynamicExport(
  module: Module,
  exports: Exports,
  object: Record<string, any>
) {
  ensureDynamicExports(module, exports);

  if (typeof object === "object" && object !== null) {
    module[REEXPORTED_OBJECTS]!.push(object);
  }
}

function exportValue(module: Module, value: any) {
  module.exports = value;
}

function exportNamespace(module: Module, namespace: any) {
  module.exports = module.namespaceObject = namespace;
}

function createGetter(obj: Record<string | symbol, any>, key: string | symbol) {
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
 * @param raw
 * @param ns
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

  // this is not really correct
  // we should set the `default` getter if the imported module is a `.cjs file`
  if (!(allowExportDefault && "default" in getters)) {
    getters["default"] = () => raw;
  }

  esm(ns, getters);
  return ns;
}

function createNS(raw: Module["exports"]): EsmNamespaceObject {
  if (typeof raw === "function") {
    return function (this: any, ...args: any[]) {
      return raw.apply(this, args);
    };
  } else {
    return Object.create(null);
  }
}

function esmImport(
  sourceModule: Module,
  id: ModuleId
): Exclude<Module["namespaceObject"], undefined> {
  const module = getOrInstantiateModuleFromParent(id, sourceModule);
  if (module.error) throw module.error;

  // any ES module has to have `module.namespaceObject` defined.
  if (module.namespaceObject) return module.namespaceObject;

  // only ESM can be an async module, so we don't need to worry about exports being a promise here.
  const raw = module.exports;
  return (module.namespaceObject = interopEsm(
    raw,
    createNS(raw),
    raw && (raw as any).__esModule
  ));
}

// Add a simple runtime require so that environments without one can still pass
// `typeof require` CommonJS checks so that exports are correctly registered.
const runtimeRequire =
  // @ts-ignore
  typeof require === "function"
    // @ts-ignore
    ? require
    : function require() {
        throw new Error("Unexpected use of runtime require");
      };

function commonJsRequire(sourceModule: Module, id: ModuleId): Exports {
  const module = getOrInstantiateModuleFromParent(id, sourceModule);
  if (module.error) throw module.error;
  return module.exports;
}

/**
 * `require.context` and require/import expression runtime.
 */
function moduleContext(map: ModuleContextMap): ModuleContext {
  function moduleContext(id: ModuleId): Exports {
    if (hasOwnProperty.call(map, id)) {
      return map[id].module();
    }

    const e = new Error(`Cannot find module '${id}'`);
    (e as any).code = "MODULE_NOT_FOUND";
    throw e;
  }

  moduleContext.keys = (): ModuleId[] => {
    return Object.keys(map);
  };

  moduleContext.resolve = (id: ModuleId): ModuleId => {
    if (hasOwnProperty.call(map, id)) {
      return map[id].id();
    }

    const e = new Error(`Cannot find module '${id}'`);
    (e as any).code = "MODULE_NOT_FOUND";
    throw e;
  };

  moduleContext.import = async (id: ModuleId) => {
    return await (moduleContext(id) as Promise<Exports>);
  };

  return moduleContext;
}

/**
 * Returns the path of a chunk defined by its data.
 */
function getChunkPath(chunkData: ChunkData): ChunkPath {
  return typeof chunkData === "string" ? chunkData : chunkData.path;
}

function isPromise<T = any>(maybePromise: any): maybePromise is Promise<T> {
  return (
    maybePromise != null &&
    typeof maybePromise === "object" &&
    "then" in maybePromise &&
    typeof maybePromise.then === "function"
  );
}

function isAsyncModuleExt<T extends {}>(obj: T): obj is AsyncModuleExt & T {
  return turbopackQueues in obj;
}

function createPromise<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    reject = rej;
    resolve = res;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

// everything below is adapted from webpack
// https://github.com/webpack/webpack/blob/6be4065ade1e252c1d8dcba4af0f43e32af1bdc1/lib/runtime/AsyncModuleRuntimeModule.js#L13

const turbopackQueues = Symbol("turbopack queues");
const turbopackExports = Symbol("turbopack exports");
const turbopackError = Symbol("turbopack error");

const enum QueueStatus {
  Unknown = -1,
  Unresolved = 0,
  Resolved = 1,
}

type AsyncQueueFn = (() => void) & { queueCount: number };
type AsyncQueue = AsyncQueueFn[] & {
  status: QueueStatus;
};

function resolveQueue(queue?: AsyncQueue) {
  if (queue && queue.status !== QueueStatus.Resolved) {
    queue.status = QueueStatus.Resolved;
    queue.forEach((fn) => fn.queueCount--);
    queue.forEach((fn) => (fn.queueCount-- ? fn.queueCount++ : fn()));
  }
}

type Dep = Exports | AsyncModulePromise | Promise<Exports>;

type AsyncModuleExt = {
  [turbopackQueues]: (fn: (queue: AsyncQueue) => void) => void;
  [turbopackExports]: Exports;
  [turbopackError]?: any;
};

type AsyncModulePromise<T = Exports> = Promise<T> & AsyncModuleExt;

function wrapDeps(deps: Dep[]): AsyncModuleExt[] {
  return deps.map((dep): AsyncModuleExt => {
    if (dep !== null && typeof dep === "object") {
      if (isAsyncModuleExt(dep)) return dep;
      if (isPromise(dep)) {
        const queue: AsyncQueue = Object.assign([], {
          status: QueueStatus.Unresolved,
        });

        const obj: AsyncModuleExt = {
          [turbopackExports]: {},
          [turbopackQueues]: (fn: (queue: AsyncQueue) => void) => fn(queue),
        };

        dep.then(
          (res) => {
            obj[turbopackExports] = res;
            resolveQueue(queue);
          },
          (err) => {
            obj[turbopackError] = err;
            resolveQueue(queue);
          }
        );

        return obj;
      }
    }

    return {
      [turbopackExports]: dep,
      [turbopackQueues]: () => {},
    };
  });
}

function asyncModule(
  module: Module,
  body: (
    handleAsyncDependencies: (
      deps: Dep[]
    ) => Exports[] | Promise<() => Exports[]>,
    asyncResult: (err?: any) => void
  ) => void,
  hasAwait: boolean
) {
  const queue: AsyncQueue | undefined = hasAwait
    ? Object.assign([], { status: QueueStatus.Unknown })
    : undefined;

  const depQueues: Set<AsyncQueue> = new Set();

  const { resolve, reject, promise: rawPromise } = createPromise<Exports>();

  const promise: AsyncModulePromise = Object.assign(rawPromise, {
    [turbopackExports]: module.exports,
    [turbopackQueues]: (fn) => {
      queue && fn(queue);
      depQueues.forEach(fn);
      promise["catch"](() => {});
    },
  } satisfies AsyncModuleExt);

  const attributes: PropertyDescriptor = {
    get(): any {
      return promise;
    },
    set(v: any) {
      // Calling `esmExport` leads to this.
      if (v !== promise) {
        promise[turbopackExports] = v;
      }
    },
  };

  Object.defineProperty(module, "exports", attributes);
  Object.defineProperty(module, "namespaceObject", attributes);

  function handleAsyncDependencies(deps: Dep[]) {
    const currentDeps = wrapDeps(deps);

    const getResult = () =>
      currentDeps.map((d) => {
        if (d[turbopackError]) throw d[turbopackError];
        return d[turbopackExports];
      });

    const { promise, resolve } = createPromise<() => Exports[]>();

    const fn: AsyncQueueFn = Object.assign(() => resolve(getResult), {
      queueCount: 0,
    });

    function fnQueue(q: AsyncQueue) {
      if (q !== queue && !depQueues.has(q)) {
        depQueues.add(q);
        if (q && q.status === QueueStatus.Unresolved) {
          fn.queueCount++;
          q.push(fn);
        }
      }
    }

    currentDeps.map((dep) => dep[turbopackQueues](fnQueue));

    return fn.queueCount ? promise : getResult();
  }

  function asyncResult(err?: any) {
    if (err) {
      reject((promise[turbopackError] = err));
    } else {
      resolve(promise[turbopackExports]);
    }

    resolveQueue(queue);
  }

  body(handleAsyncDependencies, asyncResult);

  if (queue && queue.status === QueueStatus.Unknown) {
    queue.status = QueueStatus.Unresolved;
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
 */
const relativeURL = function relativeURL(this: any, inputUrl: string) {
  const realUrl = new URL(inputUrl, "x:/");
  const values: Record<string, any> = {};
  for (const key in realUrl) values[key] = (realUrl as any)[key];
  values.href = inputUrl;
  values.pathname = inputUrl.replace(/[?#].*/, "");
  values.origin = values.protocol = "";
  values.toString = values.toJSON = (..._args: Array<any>) => inputUrl;
  for (const key in values)
    Object.defineProperty(this, key, {
      enumerable: true,
      configurable: true,
      value: values[key],
    });
};

relativeURL.prototype = URL.prototype;

/**
 * Utility function to ensure all variants of an enum are handled.
 */
function invariant(never: never, computeMessage: (arg: any) => string): never {
  throw new Error(`Invariant: ${computeMessage(never)}`);
}

/**
 * A stub function to make `require` available but non-functional in ESM.
 */
function requireStub(_moduleId: ModuleId): never {
  throw new Error("dynamic usage of require is not supported");
}
