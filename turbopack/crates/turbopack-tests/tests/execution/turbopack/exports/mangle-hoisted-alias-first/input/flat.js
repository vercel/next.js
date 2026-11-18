globalThis.flatAliasEvaluations = (globalThis.flatAliasEvaluations || 0) + 1
export const someLongExportName = 'flat'
export const a = 'flat-short'
export let liveValue = 0
export function increment() {
  liveValue++
}
