/// <reference path="./runtime-base.ts" />

/**
 * Imports whose module is evaluated on the first read of an export. Only part of the runtime
 * when the chunking context has such imports (`ChunkingContext::deferred_references`).
 *
 * The first read can be anywhere, for example in a function that runs inside the
 * `AsyncLocalStorage` store of one request. The module is not evaluated in that async context
 * but in the one this runtime was loaded in: its top-level code does not see the stores of its
 * first reader, and the timers, promises and bound functions it creates do not keep them.
 */
const deferredEvaluationContext = new (
  require('async_hooks') as typeof import('async_hooks')
).AsyncResource('TurbopackDeferredModuleEvaluation')

function esmImportDeferred(
  this: TurbopackBaseContext<Module>,
  id: ModuleId
): ReturnType<typeof esmImport> {
  return deferredEvaluationContext.runInAsyncScope(esmImport, this, id)
}
contextPrototype.d = esmImportDeferred
