/// <reference path="../../shared/runtime-types.d.ts" />

/**
 * Global type definitions for Node.js Turbopack runtime.
 * These properties are stored on globalThis to persist across chunk reloads during HMR.
 */

declare global {
  var __turbopack_module_factories__: ModuleFactories
  var __turbopack_module_cache__: Record<ModuleId, any>
  var __turbopack_runtime_modules__: Set<ModuleId>
  /**
   * Shared registry of per-runtime server HMR handler entries, keyed by the
   * runtime file's __filename. Map.set() naturally replaces stale entries when
   * a runtime file is re-evaluated. Reset to undefined by the hot-reloader on
   * full cache reset.
   */
  // NodeJsHmrPayload is only in scope inside the concatenated runtime chunk, not
  // in this .d.ts file, so the handler parameter must use any here.

  var __turbopack_server_hmr_handlers__:
    | Map<string, { handler: (update: any) => boolean; chunkPrefix: string }>
    | undefined
}

export {}
