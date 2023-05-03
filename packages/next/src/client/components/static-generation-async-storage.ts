import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../../server/lib/incremental-cache'
import { createAsyncLocalStorage } from './async-local-storage'

export interface StaticGenerationStore {
  readonly isStaticGeneration: boolean
  readonly pathname: string
  readonly originalPathname?: string
  readonly incrementalCache?: IncrementalCache
  readonly isOnDemandRevalidate?: boolean
  readonly isPrerendering?: boolean

  isRevalidate?: boolean
  forceDynamic?: boolean
  fetchCache?:
    | 'only-cache'
    | 'force-cache'
    | 'force-no-store'
    | 'default-no-store'
    | 'only-no-store'

  revalidate?: false | number
  forceStatic?: boolean
  dynamicShouldError?: boolean
  pendingRevalidates?: Promise<any>[]

  dynamicUsageDescription?: string
  dynamicUsageStack?: string

  nextFetchId?: number
  pathWasRevalidated?: boolean

  tags?: string[]
}

export type StaticGenerationAsyncStorage =
  AsyncLocalStorage<StaticGenerationStore>

export const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
  createAsyncLocalStorage()
