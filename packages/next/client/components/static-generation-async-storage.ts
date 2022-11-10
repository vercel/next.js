import type { AsyncLocalStorage } from 'async_hooks'

export interface StaticGenerationStore {
  inUse?: boolean
  pathname?: string
  revalidate?: number
  fetchRevalidate?: number
  isStaticGeneration?: boolean
}

export let staticGenerationAsyncStorage:
  | AsyncLocalStorage<StaticGenerationStore>
  | StaticGenerationStore = {}

// @ts-expect-error we provide this on globalThis in
// the edge and node runtime
if (globalThis.AsyncLocalStorage) {
  staticGenerationAsyncStorage = new (globalThis as any).AsyncLocalStorage()
}
