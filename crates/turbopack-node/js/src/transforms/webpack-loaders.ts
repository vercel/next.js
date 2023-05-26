declare const __turbopack_external_require__: {
  resolve: (name: string, opt: { paths: string[] }) => string;
} & ((id: string) => any);

import type { Ipc } from "../ipc/evaluate";
import {
  relative,
  isAbsolute,
  sep,
  dirname,
  resolve as pathResolve,
} from "path";
import {
  StackFrame,
  parse as parseStackTrace,
} from "../compiled/stacktrace-parser";

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

const transform = (
  ipc: Ipc,
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
          getResolve: () => ({
            // [TODO] this is incomplete
          }),
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
          ipc.send({
            type: "dirDependency",
            path: toPath(dep),
            glob: "**",
          });
        }
        for (const dep of result.fileDependencies) {
          ipc.send({
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

function makeErrorEmitter(severity: "warning" | "error", ipc: Ipc) {
  return function (error: Error | string) {
    ipc.send({
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
