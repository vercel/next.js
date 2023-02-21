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

type LoaderConfig =
  | string
  | {
      loader: string;
      options: { [k: string]: unknown };
    };

// @ts-ignore
let runLoaders: typeof import("loader-runner");
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
          rootContext: contextDir,
          getOptions() {
            var entry = this.loaders[this.loaderIndex];
            return entry.options && typeof entry.options === "object"
              ? entry.options
              : {};
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
