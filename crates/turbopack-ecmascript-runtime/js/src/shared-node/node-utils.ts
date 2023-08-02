/// <reference path="../shared/runtime-utils.ts" />

interface RequireContextEntry {
  external: boolean;
}

function commonJsRequireContext(
  entry: RequireContextEntry,
  sourceModule: Module
): Exports {
  return entry.external
    ? externalRequire(entry.id(), false)
    : commonJsRequire(sourceModule, entry.id());
}

function externalImport(id: ModuleId) {
  return import(id);
}

function externalRequire(
  id: ModuleId,
  esm: boolean = false
): Exports | EsmNamespaceObject {
  let raw;
  try {
    raw = require(id);
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`);
  }

  if (!esm || raw.__esModule) {
    return raw;
  }

  return interopEsm(raw, {}, true);
}
externalRequire.resolve = (
  id: string,
  options?: {
    paths?: string[];
  }
) => {
  return require.resolve(id, options);
};

async function loadWebAssemblyFromPath(
  path: string,
  importsObj: WebAssembly.Imports
): Promise<Exports> {
  const { readFile } = require("fs/promises") as typeof import("fs/promises");

  const buffer = await readFile(path);
  const { instance } = await WebAssembly.instantiate(buffer, importsObj);

  return instance.exports;
}
