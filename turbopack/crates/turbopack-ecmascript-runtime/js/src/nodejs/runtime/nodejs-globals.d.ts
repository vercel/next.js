/// <reference path="../../shared/runtime-types.d.ts" />

/**
 * Global type definitions for Node.js Turbopack runtime.
 * These properties are stored on globalThis to persist across chunk reloads during HMR.
 */

declare global {
  var __turbopack_module_factories__: ModuleFactories
  var __turbopack_module_cache__: Record<ModuleId, any>
  var __turbopack_runtime_modules__: Set<ModuleId>
}

export {}
