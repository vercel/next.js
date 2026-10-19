globalThis.parallelDependencyEvaluations =
  (globalThis.parallelDependencyEvaluations || 0) + 1
const arrivals = []
let release
const ready = new Promise((resolve) => {
  release = resolve
})
export async function meet(name) {
  arrivals.push(name)
  if (arrivals.length === 2) release()
  await ready
  return arrivals.slice().sort()
}
