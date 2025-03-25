declare const __turbopack_external_require__: (id: string, thunk: () => any, esm?: boolean) => any;

import type {Processor} from "postcss";

// @ts-ignore
import postcss from "@vercel/turbopack/postcss";
// @ts-ignore
import importedConfig from "CONFIG";
import { relative, isAbsolute, sep } from "path";
import type { Ipc } from "../ipc/evaluate";
import type { IpcInfoMessage, IpcRequestMessage } from "./webpack-loaders";

const contextDir = process.cwd();

function toPath(file: string) {
  const relPath = relative(contextDir, file);
  if (isAbsolute(relPath)) {
    throw new Error(
      `Cannot depend on path (${file}) outside of root directory (${contextDir})`
    );
  }
  return sep !== "/" ? relPath.replaceAll(sep, "/") : relPath;
}

let processor: Processor | undefined;

export const init = async (ipc: Ipc<IpcInfoMessage, IpcRequestMessage>) => {
  let config = importedConfig;
  if (typeof config === "function") {
    config = await config({ env: "development" });
  }
  if (typeof config === "undefined") {
    throw new Error(
      "PostCSS config is undefined (make sure to export an function or object from config file)"
    );
  }
  let plugins: any[];
  if (Array.isArray(config.plugins)) {
    plugins = config.plugins.map((plugin: [string, any] | string | any) => {
      if (Array.isArray(plugin)) {
        return plugin;
      } else if (typeof plugin === "string") {
        return [plugin, {}];
      } else {
        return plugin;
      }
    });
  } else if (typeof config.plugins === "object") {
    plugins = Object.entries(config.plugins).filter(([, options]) => options);
  } else {
    plugins = [];
  }
  const loadedPlugins = plugins.map((plugin) => {
    if (Array.isArray(plugin)) {
      const [arg, options] = plugin;
      let pluginFactory = arg;

      if (typeof pluginFactory === "string") {
        pluginFactory = require(/* turbopackIgnore: true */ pluginFactory);
      }

      if (pluginFactory.default) {
        pluginFactory = pluginFactory.default;
      }

      return pluginFactory(options);
    }
    return plugin;
  });

  processor = postcss(loadedPlugins);
};

export default async function transform(
  ipc: Ipc<IpcInfoMessage, IpcRequestMessage>,
  cssContent: string,
  name: string,
  sourceMap: boolean
) {
  const { css, map, messages } = await processor!.process(cssContent, {
    from: name,
    to: name,
    map: sourceMap ? {
      inline: false,
      annotation: false,
    } : undefined,
  });

  const assets = [];
  for (const msg of messages) {
    switch (msg.type) {
      case "asset":
        assets.push({
          file: msg.file,
          content: msg.content,
          sourceMap:
            !sourceMap
              ? undefined
              : typeof msg.sourceMap === "string"
              ? msg.sourceMap
              : JSON.stringify(msg.sourceMap),
          // There is also an info field, which we currently ignore
        });
        break;
      case "dependency":
      case "missing-dependency":
        ipc.sendInfo({
          type: "fileDependency",
          path: toPath(msg.file),
        });
        break;
      case "build-dependency":
        ipc.sendInfo({
          type: "buildDependency",
          path: toPath(msg.file),
        });
        break;
      case "dir-dependency":
        ipc.sendInfo({
          type: "dirDependency",
          path: toPath(msg.dir),
          glob: msg.glob,
        });
        break;
      case "context-dependency":
        ipc.sendInfo({
          type: "dirDependency",
          path: toPath(msg.file),
          glob: "**",
        });
        break;
      default:
        // TODO: do we need to do anything here?
        break;
    }
  }
  return {
    css,
    map: sourceMap ? JSON.stringify(map) : undefined,
    assets,
  };
}
