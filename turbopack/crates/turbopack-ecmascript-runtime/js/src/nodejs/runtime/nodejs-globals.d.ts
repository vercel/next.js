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
   * Shared registry of per-runtime server HMR apply functions.
   * Each Turbopack server runtime instance (one per chunking context) registers
   * its own handler here. The first runtime to register in each generation also
   * installs a multicast dispatcher as globalThis.__turbopack_server_hmr_apply__
   * so all runtimes receive HMR updates.
   * Reset to [] by the hot-reloader on full cache reset.
   */
  var __turbopack_server_hmr_handlers__:
    | Array<(update: any) => boolean>
    | undefined
}

export {}
