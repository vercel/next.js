import { AsyncLocalStorageAdapter } from '../../server/async-local-storage-adapter'

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
  AsyncLocalStorageAdapter<StaticGenerationStore>

export const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
  new AsyncLocalStorageAdapter()
