const state = globalThis as typeof globalThis & {
  __serverActionStaleRevalidationActionCount?: number
}

export function incrementActionCount() {
  state.__serverActionStaleRevalidationActionCount =
    (state.__serverActionStaleRevalidationActionCount ?? 0) + 1
  return state.__serverActionStaleRevalidationActionCount
}

export function getActionCount() {
  return state.__serverActionStaleRevalidationActionCount ?? 0
}
