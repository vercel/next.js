globalThis.chainEvaluated ??= []
globalThis.chainEvaluated.push('c')

const grow = (n) => grow(n + 1) + 1

// Only the first evaluation runs out of stack.
if (globalThis.chainEvaluated.filter((id) => id === 'c').length === 1) {
  grow(0)
}
