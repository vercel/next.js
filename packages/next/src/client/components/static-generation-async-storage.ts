import type { AsyncLocalStorage } from 'async_hooks'
import { createAsyncLocalStorage } from './async-local-storage'

export interface StaticGenerationStore {
  readonly isStaticGeneration: boolean
  readonly pathname: string
  readonly incrementalCache?: import('../../server/lib/incremental-cache').IncrementalCache
  readonly isRevalidate?: boolean

  revalidate?: number
  forceDynamic?: boolean
  fetchRevalidate?: boolean | number
  forceStatic?: boolean
  pendingRevalidates?: Promise<any>[]
}

export type StaticGenerationAsyncStorage =
  AsyncLocalStorage<StaticGenerationStore>

export const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
  createAsyncLocalStorage()
