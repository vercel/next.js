// This is a barrel file with ONLY re-exports (no directive, no sideEffects: false)
// The bundler should detect this as ModuleEvaluationIsSideEffectFree
// and tree-shake unused exports.

export { foo } from './foo'
export { bar } from './bar'
