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

// @ts-expect-error we provide this on global in
// the edge and node runtime
if (global.AsyncLocalStorage) {
  staticGenerationAsyncStorage = new (global as any).AsyncLocalStorage()
}
