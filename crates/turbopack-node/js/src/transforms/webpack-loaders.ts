declare const __turbopack_external_require__: (id: string) => any;

import type { Ipc } from "../ipc/evaluate";
import {
  relative,
  isAbsolute,
  sep,
  dirname,
  resolve as pathResolve,
} from "path";

const { runLoaders } = __turbopack_external_require__(
  "loader-runner"
) as typeof import("loader-runner");

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

const transform = (ipc: Ipc, content: string, name: string, loaders: any[]) => {
  return new Promise((resolve, reject) => {
    const resource = pathResolve(contextDir, name);
    const resourceDir = dirname(resource);
    // TODO this should be handled in turbopack instead to ensure it's watched
    loaders = loaders.map((loader: any) => {
      return require.resolve(loader, { paths: [resourceDir] });
    });
    runLoaders(
      {
        resource,
        context: {
          rootContext: contextDir,
        },
        loaders,
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
