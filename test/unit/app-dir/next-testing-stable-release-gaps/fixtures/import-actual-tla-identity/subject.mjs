const key = Symbol.for('next-testing-actual-tla-evaluations')
globalThis[key] = (globalThis[key] ?? 0) + 1
await new Promise((resolve) => setTimeout(resolve, 5))
export const evaluations = globalThis[key]
export const ready = true
export const marker = {}
export const value = 1
