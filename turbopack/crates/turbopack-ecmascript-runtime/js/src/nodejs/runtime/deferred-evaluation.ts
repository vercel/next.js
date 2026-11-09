/// <reference path="./runtime-base.ts" />

/**
 * Modules that are evaluated on the first read of one of their exports
 * (`ChunkingContext::deferred_modules`). Only part of the runtime when the chunking context has
 * such modules.
 *
 * What evaluates such a module first can be anywhere, for example in a function that runs inside
 * the `AsyncLocalStorage` store of one request: a read of an export, an `import()`, or an import
 * in a module that is itself loaded there. The factory of the module runs its body through
 * `deferredModule`, so the module is not evaluated in that async context but in the one this
 * runtime was loaded in: its top-level code does not see the stores of whatever evaluates it
 * first, and the timers, promises and bound functions it creates do not keep them.
 */
const deferredEvaluationContext = new (
  require('async_hooks') as typeof import('async_hooks')
).AsyncResource('TurbopackDeferredModuleEvaluation')

function deferredModule(body: () => void): void {
  deferredEvaluationContext.runInAsyncScope(body)
}
contextPrototype.d = deferredModule
