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

async function externalImport(id: ModuleId) {
  let raw;
  try {
    raw = await import(id);
  } catch (err) {
    // TODO(alexkirsz) This can happen when a client-side module tries to load
    // an external module we don't provide a shim for (e.g. querystring, url).
    // For now, we fail semi-silently, but in the future this should be a
    // compilation error.
    throw new Error(`Failed to load external module ${id}: ${err}`);
  }

  if (raw && raw.__esModule && raw.default && "default" in raw.default) {
    return interopEsm(raw.default, {}, true);
  }

  return raw;
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

function readWebAssemblyAsResponse(path: string) {
  const { createReadStream } = require("fs") as typeof import("fs");
  const { Readable } = require("stream") as typeof import("stream");

  const stream = createReadStream(path);

  // @ts-ignore unfortunately there's a slight type mismatch with the stream.
  return new Response(Readable.toWeb(stream), {
    headers: {
      "content-type": "application/wasm",
    },
  });
}

async function compileWebAssemblyFromPath(
  path: string
): Promise<WebAssembly.Module> {
  const response = readWebAssemblyAsResponse(path);

  return await WebAssembly.compileStreaming(response);
}

async function instantiateWebAssemblyFromPath(
  path: string,
  importsObj: WebAssembly.Imports
): Promise<Exports> {
  const response = readWebAssemblyAsResponse(path);

  const { instance } = await WebAssembly.instantiateStreaming(
    response,
    importsObj
  );

  return instance.exports;
}
