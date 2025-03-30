declare const __turbopack_external_require__: {
  resolve: (name: string, opt: { paths: string[] }) => string;
} & ((id: string, thunk: () => any, esm?: boolean) => any);

import type { Ipc } from "../ipc/evaluate";
import {
  relative,
  isAbsolute,
  join,
  sep,
  dirname,
  resolve as pathResolve,
} from "path";
import {
  StackFrame,
  parse as parseStackTrace,
} from "../compiled/stacktrace-parser";
import { type StructuredError } from "src/ipc";

export type IpcInfoMessage =
  | {
    type: "fileDependency";
    path: string;
  }
  | {
    type: "buildDependency";
    path: string;
  }
  | {
    type: "dirDependency";
    path: string;
    glob: string;
  }
  | {
    type: "envDependency";
    name: string;
  }
  | {
    type: "emittedError";
    severity: "warning" | "error";
    error: StructuredError;
  }
  | {
    type: "log";
    time: number;
    logType: string;
    args: any[];
    trace?: StackFrame[];
  };

export type IpcRequestMessage = {
  type: "resolve";
  options: any;
  lookupPath: string;
  request: string;
};

type LoaderConfig =
  | string
  | {
    loader: string;
    options: { [k: string]: unknown };
  };

const { runLoaders }: typeof import("loader-runner") = require("@vercel/turbopack/loader-runner");

const contextDir = process.cwd();
const toPath = (file: string) => {
  const relPath = relative(contextDir, file);
  if (isAbsolute(relPath)) {
    throw new Error(
      `Cannot depend on path (${file}) outside of root directory (${contextDir})`
    );
  }
  return sep !== "/" ? relPath.replaceAll(sep, "/") : relPath;
};
const fromPath = (path: string) => {
  return join(contextDir, sep !== "/" ? path.replaceAll("/", sep) : path);
};

const LogType = Object.freeze({
  error: "error",
  warn: "warn",
  info: "info",
  log: "log",
  debug: "debug",

  trace: "trace",

  group: "group",
  groupCollapsed: "groupCollapsed",
  groupEnd: "groupEnd",

  profile: "profile",
  profileEnd: "profileEnd",

  time: "time",

  clear: "clear",
  status: "status",
});

const loaderFlag = "LOADER_EXECUTION";

const cutOffByFlag = (stack: string, flag: string): string => {
  const errorStack = stack.split("\n");
  for (let i = 0; i < errorStack.length; i++) {
    if (errorStack[i].includes(flag)) {
      errorStack.length = i;
    }
  }
  return errorStack.join("\n");
};

/**
 * @param stack stack trace
 * @returns stack trace without the loader execution flag included
 */
const cutOffLoaderExecution = (stack: string): string =>
  cutOffByFlag(stack, loaderFlag);

class DummySpan {
  traceChild() {
    return new DummySpan();
  }

  traceFn<T>(fn: (span: DummySpan) => T): T {
    return fn(this);
  }

  async traceAsyncFn<T>(fn: (span: DummySpan) => T | Promise<T>): Promise<T> {
    return await fn(this);
  }

  stop() {
    return;
  }
}

type ResolveOptions = {
  dependencyType?: string;
  alias?: Record<string, string[]> | unknown[];
  aliasFields?: string[];
  cacheWithContext?: boolean;
  conditionNames?: string[];
  descriptionFiles?: string[];
  enforceExtension?: boolean;
  extensionAlias: Record<string, string[]>;
  extensions?: string[];
  fallback?: Record<string, string[]>;
  mainFields?: string[];
  mainFiles?: string[];
  exportsFields?: string[];
  modules?: string[];
  plugins?: unknown[];
  symlinks?: boolean;
  unsafeCache?: boolean;
  useSyncFileSystemCalls?: boolean;
  preferRelative?: boolean;
  preferAbsolute?: boolean;
  restrictions?: unknown[];
  roots?: string[];
  importFields?: string[];
};

// Patch process.env to track which env vars are read
const originalEnv = process.env;
const readEnvVars = new Set<string>();
process.env = new Proxy(originalEnv, {
  get(target, prop) {
    if (typeof prop === 'string' && !readEnvVars.has(prop)) {
      // We register the env var as dependency on the
      // current transform and all future transforms
      // since the env var might be cached in module scope
      // and influence them all
      readEnvVars.add(prop);
    }
    return Reflect.get(target, prop);
  },
})

const transform = (
  ipc: Ipc<IpcInfoMessage, IpcRequestMessage>,
  content: string,
  name: string,
  query: string,
  loaders: LoaderConfig[],
  sourceMap: boolean
) => {
  return new Promise((resolve, reject) => {
    const resource = pathResolve(contextDir, name);
    const resourceDir = dirname(resource);

    const loadersWithOptions = loaders.map((loader) =>
      typeof loader === "string" ? { loader, options: {} } : loader
    );

    runLoaders(
      {
        resource: resource + query,
        context: {
          _module: {
            // For debugging purpose, if someone find context is not full compatible to
            // webpack they can guess this comes from turbopack
            __reserved: "TurbopackContext",
          },
          currentTraceSpan: new DummySpan(),
          rootContext: contextDir,
          sourceMap,
          getOptions() {
            const entry = this.loaders[this.loaderIndex];
            return entry.options && typeof entry.options === "object"
              ? entry.options
              : {};
          },
          getResolve: (options: ResolveOptions) => {
            const rustOptions = {
              aliasFields: undefined as undefined | string[],
              conditionNames: undefined as undefined | string[],
              noPackageJson: false,
              extensions: undefined as undefined | string[],
              mainFields: undefined as undefined | string[],
              noExportsField: false,
              mainFiles: undefined as undefined | string[],
              noModules: false,
              preferRelative: false,
            };
            if (options.alias) {
              if (!Array.isArray(options.alias) || options.alias.length > 0) {
                throw new Error("alias resolve option is not supported");
              }
            }
            if (options.aliasFields) {
              if (!Array.isArray(options.aliasFields)) {
                throw new Error("aliasFields resolve option must be an array");
              }
              rustOptions.aliasFields = options.aliasFields;
            }
            if (options.conditionNames) {
              if (!Array.isArray(options.conditionNames)) {
                throw new Error(
                  "conditionNames resolve option must be an array"
                );
              }
              rustOptions.conditionNames = options.conditionNames;
            }
            if (options.descriptionFiles) {
              if (
                !Array.isArray(options.descriptionFiles) ||
                options.descriptionFiles.length > 0
              ) {
                throw new Error(
                  "descriptionFiles resolve option is not supported"
                );
              }
              rustOptions.noPackageJson = true;
            }
            if (options.extensions) {
              if (!Array.isArray(options.extensions)) {
                throw new Error("extensions resolve option must be an array");
              }
              rustOptions.extensions = options.extensions;
            }
            if (options.mainFields) {
              if (!Array.isArray(options.mainFields)) {
                throw new Error("mainFields resolve option must be an array");
              }
              rustOptions.mainFields = options.mainFields;
            }
            if (options.exportsFields) {
              if (
                !Array.isArray(options.exportsFields) ||
                options.exportsFields.length > 0
              ) {
                throw new Error(
                  "exportsFields resolve option is not supported"
                );
              }
              rustOptions.noExportsField = true;
            }
            if (options.mainFiles) {
              if (!Array.isArray(options.mainFiles)) {
                throw new Error("mainFiles resolve option must be an array");
              }
              rustOptions.mainFiles = options.mainFiles;
            }
            if (options.modules) {
              if (
                !Array.isArray(options.modules) ||
                options.modules.length > 0
              ) {
                throw new Error("modules resolve option is not supported");
              }
              rustOptions.noModules = true;
            }
            if (options.restrictions) {
              // TODO This is ignored for now
            }
            if (options.dependencyType) {
              // TODO This is ignored for now
            }
            if (options.preferRelative) {
              if (typeof options.preferRelative !== "boolean") {
                throw new Error(
                  "preferRelative resolve option must be a boolean"
                );
              }
              rustOptions.preferRelative = options.preferRelative;
            }
            return (
              lookupPath: string,
              request: string,
              callback?: (err?: Error, result?: string) => void
            ) => {
              const promise = ipc
                .sendRequest({
                  type: "resolve",
                  options: rustOptions,
                  lookupPath: toPath(lookupPath),
                  request,
                })
                .then((unknownResult) => {
                  let result = unknownResult as { path: string };
                  if (result && typeof result.path === "string") {
                    return fromPath(result.path);
                  } else {
                    throw Error(
                      "Expected { path: string } from resolve request"
                    );
                  }
                });
              if (callback) {
                promise
                  .then(
                    (result) => callback(undefined, result),
                    (err) => callback(err)
                  )
                  .catch((err) => {
                    ipc.sendError(err);
                  });
              } else {
                return promise;
              }
            };
          },
          emitWarning: makeErrorEmitter("warning", ipc),
          emitError: makeErrorEmitter("error", ipc),
          getLogger(name: unknown) {
            const logFn = (logType: string, ...args: unknown[]) => {
              let trace;
              switch (logType) {
                case LogType.warn:
                case LogType.error:
                case LogType.trace:
                case LogType.debug:
                  trace = parseStackTrace(
                    cutOffLoaderExecution(new Error("Trace").stack!)
                      .split("\n")
                      .slice(3)
                      .join("\n")
                  );
                  break;
                default:
                  // TODO: do we need to handle this?
                  break
              }

              ipc.sendInfo({
                type: "log",
                time: Date.now(),
                logType,
                args,
                trace,
              });
            };
            let timers: Map<string, [number, number]> | undefined;
            let timersAggregates: Map<string, [number, number]> | undefined;

            // See https://github.com/webpack/webpack/blob/a48c34b34d2d6c44f9b2b221d7baf278d34ac0be/lib/logging/Logger.js#L8
            return {
              error: logFn.bind(this, LogType.error),
              warn: logFn.bind(this, LogType.warn),
              info: logFn.bind(this, LogType.info),
              log: logFn.bind(this, LogType.log),
              debug: logFn.bind(this, LogType.debug),
              assert: (assertion: boolean, ...args: any[]) => {
                if (!assertion) {
                  logFn(LogType.error, ...args);
                }
              },
              trace: logFn.bind(this, LogType.trace),
              clear: logFn.bind(this, LogType.clear),
              status: logFn.bind(this, LogType.status),
              group: logFn.bind(this, LogType.group),
              groupCollapsed: logFn.bind(this, LogType.groupCollapsed),
              groupEnd: logFn.bind(this, LogType.groupEnd),
              profile: logFn.bind(this, LogType.profile),
              profileEnd: logFn.bind(this, LogType.profileEnd),
              time: (label: string) => {
                timers = timers || new Map();
                timers.set(label, process.hrtime());
              },
              timeLog: (label: string) => {
                const prev = timers && timers.get(label);
                if (!prev) {
                  throw new Error(
                    `No such label '${label}' for WebpackLogger.timeLog()`
                  );
                }
                const time = process.hrtime(prev);
                logFn(LogType.time, [label, ...time]);
              },
              timeEnd: (label: string) => {
                const prev = timers && timers.get(label);
                if (!prev) {
                  throw new Error(
                    `No such label '${label}' for WebpackLogger.timeEnd()`
                  );
                }
                const time = process.hrtime(prev);
                /** @type {Map<string | undefined, [number, number]>} */
                timers!.delete(label);
                logFn(LogType.time, [label, ...time]);
              },
              timeAggregate: (label: string) => {
                const prev = timers && timers.get(label);
                if (!prev) {
                  throw new Error(
                    `No such label '${label}' for WebpackLogger.timeAggregate()`
                  );
                }
                const time = process.hrtime(prev);
                /** @type {Map<string | undefined, [number, number]>} */
                timers!.delete(label);
                /** @type {Map<string | undefined, [number, number]>} */
                timersAggregates = timersAggregates || new Map();
                const current = timersAggregates.get(label);
                if (current !== undefined) {
                  if (time[1] + current[1] > 1e9) {
                    time[0] += current[0] + 1;
                    time[1] = time[1] - 1e9 + current[1];
                  } else {
                    time[0] += current[0];
                    time[1] += current[1];
                  }
                }
                timersAggregates.set(label, time);
              },
              timeAggregateEnd: (label: string) => {
                if (timersAggregates === undefined) return;
                const time = timersAggregates.get(label);
                if (time === undefined) return;
                timersAggregates.delete(label);
                logFn(LogType.time, [label, ...time]);
              },
            };
          },
        },

        loaders: loadersWithOptions.map((loader) => ({
          loader: __turbopack_external_require__.resolve(loader.loader, {
            paths: [resourceDir],
          }),
          options: loader.options,
        })),
        readResource: (_filename, callback) => {
          // TODO assuming the filename === resource, but loaders might change that
          callback(null, Buffer.from(content, "utf-8"));
        },
      },
      (err, result) => {
        for (const envVar of readEnvVars) {
          ipc.sendInfo({
            type: "envDependency",
            name: envVar,
          });
        }
        for (const dep of result.contextDependencies) {
          ipc.sendInfo({
            type: "dirDependency",
            path: toPath(dep),
            glob: "**",
          });
        }
        for (const dep of result.fileDependencies) {
          ipc.sendInfo({
            type: "fileDependency",
            path: toPath(dep),
          });
        }
        if (err) return reject(err);
        if (!result.result) return reject(new Error("No result from loaders"));
        const [source, map] = result.result;
        resolve({
          source: Buffer.isBuffer(source) ? { binary: source.toString('base64') } : source,
          map:
            typeof map === "string"
              ? map
              : typeof map === "object"
                ? JSON.stringify(map)
                : undefined,
        });
      }
    );
  });
};

export { transform as default };

function makeErrorEmitter(
  severity: "warning" | "error",
  ipc: Ipc<IpcInfoMessage, IpcRequestMessage>
) {
  return function (error: Error | string) {
    ipc.sendInfo({
      type: "emittedError",
      severity: severity,
      error:
        error instanceof Error
          ? {
            name: error.name,
            message: error.message,
            stack: error.stack ? parseStackTrace(error.stack) : [],
            cause: undefined,
          }
          : {
            name: "Error",
            message: error,
            stack: [],
            cause: undefined,
          },
    });
  };
}
