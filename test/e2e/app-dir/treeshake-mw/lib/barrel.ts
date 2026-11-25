// Star re-export barrel. Because `getKey` is not a static named entrypoint of
// this module, resolving `import { getKey } from './lib/barrel'` goes through
// `follow_reexports_with_side_effects`, which builds a `SideEffectsModule`.
// This barrel has an import but no top-level side effects, so it is classified
// `ModuleEvaluationIsSideEffectFree` — the status that triggers the desync.
export * from './keys'
