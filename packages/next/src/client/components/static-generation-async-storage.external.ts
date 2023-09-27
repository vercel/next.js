import type { AsyncLocalStorage } from 'async_hooks'
import type { IncrementalCache } from '../../server/lib/incremental-cache'
import type { DynamicServerError } from './hooks-server-context'
import type { FetchMetrics } from '../../server/base-http'
import { createAsyncLocalStorage } from './async-local-storage'

export interface StaticGenerationStore {
  readonly isStaticGeneration: boolean
  readonly pagePath?: string
  readonly urlPathname: string
  readonly incrementalCache?: IncrementalCache
  readonly isOnDemandRevalidate?: boolean
  readonly isPrerendering?: boolean
  readonly isRevalidate?: boolean

  forceDynamic?: boolean
  fetchCache?:
    | 'only-cache'
    | 'force-cache'
    | 'default-cache'
    | 'force-no-store'
    | 'default-no-store'
    | 'only-no-store'

  revalidate?: false | number
  forceStatic?: boolean
  dynamicShouldError?: boolean
  pendingRevalidates?: Promise<any>[]

  dynamicUsageDescription?: string
  dynamicUsageStack?: string
  dynamicUsageErr?: DynamicServerError

  nextFetchId?: number
  pathWasRevalidated?: boolean

  tags?: string[]

  revalidatedTags?: string[]
  fetchMetrics?: FetchMetrics

  isDraftMode?: boolean
}

export type StaticGenerationAsyncStorage =
  AsyncLocalStorage<StaticGenerationStore>

export const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
  createAsyncLocalStorage()
