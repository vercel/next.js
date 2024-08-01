/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../shared/runtime-utils.ts" />

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
