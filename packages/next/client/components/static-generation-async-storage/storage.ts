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

if (process.env.NEXT_RUNTIME !== 'edge' && typeof window === 'undefined') {
  staticGenerationAsyncStorage =
    new (require('async_hooks').AsyncLocalStorage)()
}
