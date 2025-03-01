/**
 * This file acts as a dummy implementor for the interface that
 * `runtime-base.ts` expects to be available in the global scope.
 *
 * This interface will be implemented by runtime backends.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../shared/runtime-utils.ts" />
/// <reference path="../../../shared/require-type.d.ts" />

declare var BACKEND: RuntimeBackend;
declare var loadWebAssembly: (
  source: SourceInfo,
  wasmChunkPath: ChunkPath,
  imports: WebAssembly.Imports
) => Exports;
declare var loadWebAssemblyModule: (
  source: SourceInfo,
  wasmChunkPath: ChunkPath
) => WebAssembly.Module;
declare var relativeURL: (inputUrl: string) => void;
