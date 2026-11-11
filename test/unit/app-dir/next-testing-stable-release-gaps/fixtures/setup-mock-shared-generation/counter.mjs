globalThis.setupDependencyEvaluations =
  (globalThis.setupDependencyEvaluations || 0) + 1
export let count = 0
export function increment() {
  count++
}
export const token = {}
