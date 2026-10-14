/**
 * Hooks that every development runtime defines for `instantiateModule` in
 * `hmr-runtime.ts`.
 *
 * function hoisting will make them available to callers, and failure to
 * define them will just manifest as ReferenceErrors.
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
