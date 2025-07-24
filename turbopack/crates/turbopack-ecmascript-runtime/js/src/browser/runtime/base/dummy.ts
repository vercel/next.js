/**
 * This file acts as a dummy implementor for the interface that
 * `runtime-base.ts` expects to be available in the global scope.
 *
 * This interface will be implemented by runtime backends.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/// <reference path="../../../shared/runtime-utils.ts" />
/// <reference path="../../../shared/require-type.d.ts" />

declare var BACKEND: RuntimeBackend
declare var loadWebAssembly: (
  sourceType: SourceType,
  sourceData: SourceData,
  wasmChunkPath: ChunkPath,
  edgeModule: () => WebAssembly.Module,
  imports: WebAssembly.Imports
) => Exports
declare var loadWebAssemblyModule: (
  sourceType: SourceType,
  sourceData: SourceData,
  wasmChunkPath: ChunkPath,
  edgeModule: () => WebAssembly.Module
) => WebAssembly.Module
declare var relativeURL: (inputUrl: string) => void
