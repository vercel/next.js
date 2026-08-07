import { createSnapshot } from './async-local-storage'
import { createInstantInsightsWorkStore } from './instant-insights-work-store'
import { workAsyncStorage, type WorkStore } from './work-async-storage.external'
import {
  workUnitAsyncStorage,
  type RequestStore,
} from './work-unit-async-storage.external'
import {
  createLocalSpan,
  getActiveLocalSpan,
  withLocalSpan,
} from '../lib/trace/local-span-recorder'
import {
  getRequestInsightsIdentity,
  runWithRequestInsightsIdentity,
  type RequestInsightsIdentity,
} from '../lib/trace/request-insights-identity'

function createTestWorkStore(): WorkStore {
  const runInCleanSnapshot: WorkStore['runInCleanSnapshot'] = (fn, ...args) =>
    fn(...args)

  return {
    route: '/instant-insights',
    invalidDynamicUsageError: new Error('foreground'),
    dynamicUsageDescription: 'foreground',
    dynamicUsageStack: 'foreground',
    nextFetchId: 1,
    pathWasRevalidated: 'tag',
    pendingRevalidates: { foreground: Promise.resolve() },
    pendingRevalidateWrites: [Promise.resolve()],
    pendingRevalidatedTags: [
      { tag: 'foreground', revalidatedAt: performance.now() },
    ],
    previouslyRevalidatedTags: ['foreground'],
    refreshTagsByCacheKind: new Map([['foreground', Promise.resolve()]]),
    fetchMetrics: [{}],
    shouldTrackFetchMetrics: true,
    pendingCacheInvocations: new Map([['foreground', Promise.resolve({})]]),
    completedCacheInvocations: new Map([['foreground', Promise.resolve({})]]),
    reactServerErrorsByDigest: new Map([
      ['foreground', new Error('foreground')],
    ]),
    additionalClientReferenceManifestPages: new Set(['/foreground']),
    runInCleanSnapshot,
  } as unknown as WorkStore
}

describe('Instant Insights work store', () => {
  const originalNextDevServer = process.env.__NEXT_DEV_SERVER

  beforeAll(() => {
    process.env.__NEXT_DEV_SERVER = '1'
  })

  afterAll(() => {
    if (originalNextDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalNextDevServer
    }
  })

  it('isolates validation state and restores diagnostic ownership in clean snapshots', () => {
    const foregroundIdentity: RequestInsightsIdentity = {
      requestId: 'request',
      htmlRequestId: 'page',
      url: '/instant-insights',
    }
    const instantInsightsIdentity: RequestInsightsIdentity = {
      ...foregroundIdentity,
      kind: 'instant-insights',
    }
    const foregroundWorkStore = createTestWorkStore()
    const foregroundWorkUnitStore = {
      type: 'request',
      phase: 'render',
    } as unknown as RequestStore
    const foregroundSpan = createLocalSpan({ name: 'foreground' })
    const foregroundAfterContext = foregroundWorkStore.afterContext

    workAsyncStorage.run(foregroundWorkStore, () =>
      workUnitAsyncStorage.run(foregroundWorkUnitStore, () =>
        runWithRequestInsightsIdentity(foregroundIdentity, () =>
          withLocalSpan(foregroundSpan, () => {
            foregroundWorkStore.runInCleanSnapshot = createSnapshot()
          })
        )
      )
    )

    const instantInsightsWorkStore =
      createInstantInsightsWorkStore(foregroundWorkStore)
    const instantInsightsSpan = createLocalSpan({ name: 'Instant Insights' })

    let observed:
      | {
          identity: RequestInsightsIdentity | undefined
          workStore: WorkStore | undefined
          workUnitStore: RequestStore | undefined
          span: ReturnType<typeof getActiveLocalSpan>
        }
      | undefined

    workAsyncStorage.run(instantInsightsWorkStore, () =>
      runWithRequestInsightsIdentity(instantInsightsIdentity, () =>
        withLocalSpan(instantInsightsSpan, () =>
          instantInsightsWorkStore.runInCleanSnapshot(() => {
            observed = {
              identity: getRequestInsightsIdentity(),
              workStore: workAsyncStorage.getStore(),
              workUnitStore: workUnitAsyncStorage.getStore() as
                | RequestStore
                | undefined,
              span: getActiveLocalSpan(),
            }
          })
        )
      )
    )

    expect(observed).toEqual({
      identity: instantInsightsIdentity,
      workStore: instantInsightsWorkStore,
      workUnitStore: undefined,
      span: instantInsightsSpan,
    })
    expect(instantInsightsWorkStore.fetchMetrics).toEqual([])
    expect(instantInsightsWorkStore.fetchMetrics).not.toBe(
      foregroundWorkStore.fetchMetrics
    )
    expect(instantInsightsWorkStore.pendingCacheInvocations).toEqual(new Map())
    expect(instantInsightsWorkStore.pendingCacheInvocations).not.toBe(
      foregroundWorkStore.pendingCacheInvocations
    )
    expect(instantInsightsWorkStore.completedCacheInvocations).toEqual(
      new Map()
    )
    expect(instantInsightsWorkStore.completedCacheInvocations).not.toBe(
      foregroundWorkStore.completedCacheInvocations
    )
    expect(instantInsightsWorkStore.pendingRevalidates).toEqual({})
    expect(instantInsightsWorkStore.pendingRevalidateWrites).toEqual([])
    expect(instantInsightsWorkStore.pendingRevalidatedTags).toEqual([])
    expect(instantInsightsWorkStore.previouslyRevalidatedTags).toEqual([])
    expect(instantInsightsWorkStore.refreshTagsByCacheKind).toEqual(new Map())
    expect(instantInsightsWorkStore.shouldTrackFetchMetrics).toBe(false)
    expect(instantInsightsWorkStore.afterContext).toBeDefined()
    expect(instantInsightsWorkStore.afterContext).not.toBe(
      foregroundAfterContext
    )
    expect(instantInsightsWorkStore.reactServerErrorsByDigest).toEqual(
      new Map()
    )
    expect(instantInsightsWorkStore.reactServerErrorsByDigest).not.toBe(
      foregroundWorkStore.reactServerErrorsByDigest
    )
    expect(instantInsightsWorkStore.invalidDynamicUsageError).toBeUndefined()
    expect(instantInsightsWorkStore.dynamicUsageDescription).toBeUndefined()
    expect(instantInsightsWorkStore.dynamicUsageStack).toBeUndefined()
    expect(instantInsightsWorkStore.nextFetchId).toBeUndefined()
    expect(instantInsightsWorkStore.pathWasRevalidated).toBeUndefined()
    expect(
      instantInsightsWorkStore.additionalClientReferenceManifestPages
    ).toEqual(new Set(['/foreground']))
    expect(
      instantInsightsWorkStore.additionalClientReferenceManifestPages
    ).not.toBe(foregroundWorkStore.additionalClientReferenceManifestPages)

    instantInsightsSpan.end()
    foregroundSpan.end()
  })
})
