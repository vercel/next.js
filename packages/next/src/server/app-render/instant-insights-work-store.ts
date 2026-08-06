import type { WorkStore } from './work-async-storage.external'
import { workAsyncStorage } from './work-async-storage.external'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import {
  getActiveLocalSpan,
  withLocalSpan,
} from '../lib/trace/local-span-recorder'
import {
  getRequestInsightsIdentity,
  runWithRequestInsightsIdentity,
} from '../lib/trace/request-insights-identity'

type WorkStoreFieldTreatment = 'inherit' | 'reset'

// Keep this exhaustive so new WorkStore state cannot silently flow into the
// isolated Instant Insights render through the object spread below.
type InstantInsightsWorkStoreFieldTreatments = {
  page: 'inherit'
  route: 'inherit'
  incrementalCache: 'inherit'
  cacheLifeProfiles: 'inherit'
  useCacheTimeout: 'inherit'
  staticPageGenerationTimeout: 'inherit'
  isOnDemandRevalidate: 'reset'
  isBuildTimePrerendering: 'reset'
  forceDynamic: 'inherit'
  fetchCache: 'inherit'
  forceStatic: 'inherit'
  dynamicShouldError: 'inherit'
  pendingRevalidates: 'reset'
  pendingRevalidateWrites: 'reset'
  afterContext: 'reset'
  dynamicUsageDescription: 'reset'
  dynamicUsageStack: 'reset'
  invalidDynamicUsageError: 'reset'
  nextFetchId: 'reset'
  pathWasRevalidated: 'reset'
  pendingRevalidatedTags: 'reset'
  previouslyRevalidatedTags: 'reset'
  requestStartTime: 'inherit'
  refreshTagsByCacheKind: 'reset'
  fetchMetrics: 'reset'
  shouldTrackFetchMetrics: 'reset'
  pendingCacheInvocations: 'reset'
  completedCacheInvocations: 'reset'
  useCacheProbeMode: 'inherit'
  isDraftMode: 'inherit'
  isUnstableNoStore: 'inherit'
  isPrefetchRequest: 'inherit'
  requestId: 'inherit'
  htmlRequestId: 'inherit'
  deploymentId: 'inherit'
  buildId: 'inherit'
  reactLoadableManifest: 'inherit'
  assetPrefix: 'inherit'
  nonce: 'inherit'
  cacheComponentsEnabled: 'inherit'
  validationLevel: 'inherit'
  additionalClientReferenceManifestPages: 'reset'
  runInCleanSnapshot: 'reset'
  reactServerErrorsByDigest: 'reset'
}

type AssertNever<T extends never> = T

type _AssertInstantInsightsWorkStoreTreatmentsAreExhaustive = AssertNever<
  | Exclude<keyof WorkStore, keyof InstantInsightsWorkStoreFieldTreatments>
  | Exclude<keyof InstantInsightsWorkStoreFieldTreatments, keyof WorkStore>
  | Exclude<
      InstantInsightsWorkStoreFieldTreatments[keyof InstantInsightsWorkStoreFieldTreatments],
      WorkStoreFieldTreatment
    >
>

export function createInstantInsightsWorkStore(
  outerWorkStore: WorkStore
): WorkStore {
  const { AfterContext } =
    require('../after/after-context') as typeof import('../after/after-context')
  const workStore: WorkStore = {
    ...outerWorkStore,
    isBuildTimePrerendering: false,
    isOnDemandRevalidate: false,
    invalidDynamicUsageError: undefined,
    dynamicUsageDescription: undefined,
    dynamicUsageStack: undefined,
    nextFetchId: undefined,
    pathWasRevalidated: undefined,
    pendingRevalidates: {},
    pendingRevalidateWrites: [],
    pendingRevalidatedTags: [],
    previouslyRevalidatedTags: [],
    refreshTagsByCacheKind: new Map(),
    fetchMetrics: [],
    shouldTrackFetchMetrics: false,
    pendingCacheInvocations: new Map(),
    completedCacheInvocations: new Map(),
    reactServerErrorsByDigest: new Map(),
    afterContext: new AfterContext({
      waitUntil(promise) {
        promise.catch(() => {})
      },
      onClose() {},
      onTaskError() {},
    }),
    additionalClientReferenceManifestPages:
      outerWorkStore.additionalClientReferenceManifestPages === undefined
        ? undefined
        : new Set(outerWorkStore.additionalClientReferenceManifestPages),
    runInCleanSnapshot<R, TArgs extends any[]>(
      fn: (...args: TArgs) => R,
      ...args: TArgs
    ): R {
      const requestInsightsIdentity = getRequestInsightsIdentity()
      const activeLocalSpan = getActiveLocalSpan()

      return outerWorkStore.runInCleanSnapshot(() =>
        workUnitAsyncStorage.exit(() =>
          workAsyncStorage.run(workStore, () => {
            const run = () => fn(...args)
            const runWithIdentity = () =>
              requestInsightsIdentity
                ? runWithRequestInsightsIdentity(requestInsightsIdentity, run)
                : run()

            return activeLocalSpan
              ? withLocalSpan(activeLocalSpan, runWithIdentity)
              : runWithIdentity()
          })
        )
      )
    },
  }

  return workStore
}
