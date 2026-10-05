/**
 * Hooks that every development runtime defines for `instantiateModule` in
 * `hmr-runtime.ts`.
 *
 * They are only declared here, so a runtime that doesn't define one fails with a
 * `ReferenceError` on the first module instead of calling `undefined`.
 */

/**
 * Called right before a module factory runs. May return a callback, which is
 * called once the factory returns or throws.
 */
declare function interceptDevModuleExecution(
  module: HotModule
): (() => void) | undefined

/**
 * Creates the `__turbopack_context__` passed to a module factory. Called after
 * `interceptDevModuleExecution`; `intercepted` is whether it returned a
 * callback for this module.
 */
declare function createDevModuleContext(
  module: HotModule,
  exports: Exports,
  intercepted: boolean
): TurbopackBaseContext<HotModule>
