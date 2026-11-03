globalThis.preservedAliasEvaluations =
  (globalThis.preservedAliasEvaluations || 0) + 1
export const someLongExportName = 'preserved'
export let liveValue = 0
export function increment() {
  liveValue++
}
