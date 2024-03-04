declare const __turbopack_external_require__: {
  resolve: (name: string, opt: { paths: string[] }) => string;
} & ((id: string) => any);

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
      type: "emittedError";
      severity: "warning" | "error";
      error: StructuredError;
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

let runLoaders: typeof import("loader-runner")["runLoaders"];
try {
  ({ runLoaders } = require("@vercel/turbopack/loader-runner"));
} catch {
  ({ runLoaders } = __turbopack_external_require__("loader-runner"));
}

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
const SUPPORTED_RESOLVE_OPTIONS = new Set([
  "alias",
  "aliasFields",
  "conditionNames",
  "descriptionFiles",
  "extensions",
  "exportsFields",
  "mainFields",
  "mainFiles",
  "modules",
  "restrictions",
  "preferRelative",
  "dependencyType",
]);

const transform = (
  ipc: Ipc<IpcInfoMessage, IpcRequestMessage>,
  content: string,
  name: string,
  loaders: LoaderConfig[]
) => {
  return new Promise((resolve, reject) => {
    const resource = pathResolve(contextDir, name);
    const resourceDir = dirname(resource);

    const loadersWithOptions = loaders.map((loader) =>
      typeof loader === "string" ? { loader, options: {} } : loader
    );

    runLoaders(
      {
        resource,
        context: {
          currentTraceSpan: new DummySpan(),
          rootContext: contextDir,
          getOptions() {
            const entry = this.loaders[this.loaderIndex];
            return entry.options && typeof entry.options === "object"
              ? entry.options
              : {};
          },
          getResolve: (options: ResolveOptions) => {
            const rustOptions = {
              noAlias: false,
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
              rustOptions.noAlias = true;
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
            return (type: unknown, args: unknown) => {
              let trace;
              switch (type) {
                case LogType.warn:
                case LogType.error:
                case LogType.trace:
                  trace = cutOffLoaderExecution(new Error("Trace").stack!)
                    .split("\n")
                    .slice(3);
                  break;
              }
              const logEntry = {
                time: Date.now(),
                type,
                args,
                trace,
              };

              this.hooks.log.call(name, logEntry);
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
        if (err) return reject(err);
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
        if (!result.result) return reject(new Error("No result from loaders"));
        const [source, map] = result.result;
        resolve({ source, map });
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
              stack: parseStackTrace(error.stack),
            }
          : {
              name: "Error",
              message: error,
              stack: [],
            },
    });
  };
}
