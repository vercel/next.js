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
const { AsyncResource: DeferredEvaluationResource } =
  require('async_hooks') as typeof import('async_hooks')
const deferredEvaluationContext = new DeferredEvaluationResource(
  'TurbopackDeferredModuleEvaluation'
)

function createDeferredEvaluationResource() {
  return new DeferredEvaluationResource('TurbopackDeferredModuleEvaluation')
}

function deferredModule(body: () => void): void {
  // Each evaluation gets a resource of its own, created in the context of this runtime. Before
  // Node.js 24, `AsyncLocalStorage.enterWith()` keeps the store on the resource that is current:
  // on a shared one, every module that is evaluated later would see a store that the top-level
  // code of one module entered.
  deferredEvaluationContext
    .runInAsyncScope(createDeferredEvaluationResource)
    .runInAsyncScope(body)
}
contextPrototype.d = deferredModule
