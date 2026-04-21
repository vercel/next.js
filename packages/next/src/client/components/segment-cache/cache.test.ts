import {
  HEAD_REQUEST_KEY,
  type SegmentRequestKey,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import type { VaryParamsThenable } from '../../../shared/lib/segment-cache/vary-params-decoding'
import { FetchStrategy } from './types'
import { Fallback } from './cache-map'
import {
  EntryStatus,
  getOutputExportSegmentRequestUrl,
  invalidateEntirePrefetchCache,
  readSegmentCacheEntry,
  readOrCreateSegmentCacheEntry,
  upgradeToPendingSegment,
  writeDynamicRenderResponseIntoCache,
} from './cache'
import { finalizeMetadataVaryPath, finalizePageVaryPath } from './vary-path'

describe('getOutputExportSegmentRequestUrl', () => {
  it('uses the concrete rendered route when no fallback base path is known', () => {
    expect(
      getOutputExportSegmentRequestUrl(
        new URL('https://example.com/org/acme/chat/thread-456/?mode=full'),
        HEAD_REQUEST_KEY,
        null
      ).href
    ).toBe(
      'https://example.com/org/acme/chat/thread-456/__next._head.txt?mode=full'
    )
  })

  it('reuses the learned fallback base path for sibling segment requests', () => {
    expect(
      getOutputExportSegmentRequestUrl(
        new URL('https://example.com/org/acme/chat/thread-456/?mode=full'),
        '/t/$d$threadId' as SegmentRequestKey,
        '/org/__fallback'
      ).href
    ).toBe(
      'https://example.com/org/__fallback/__next.t.$d$threadId.txt?mode=full'
    )
  })

  it('keeps the matched branch fallback base path for conflicting routes', () => {
    expect(
      getOutputExportSegmentRequestUrl(
        new URL('https://example.com/docs/api/reference'),
        '/docs/$d$section/$d$page' as SegmentRequestKey,
        '/docs/__fallback/__route_0'
      ).href
    ).toBe(
      'https://example.com/docs/__fallback/__route_0/__next.docs.$d$section.$d$page.txt'
    )
  })
})

describe('readOrCreateSegmentCacheEntry output export fallback', () => {
  afterEach(() => {
    delete process.env.__NEXT_VARY_PARAMS
    invalidateEntirePrefetchCache(null, ['', {}])
  })

  it('dedupes pending metadata entries across sibling fallback params', () => {
    const now = Date.now()
    const firstTree = {
      requestKey: HEAD_REQUEST_KEY,
      segment: HEAD_REQUEST_KEY,
      refreshState: null,
      varyPath: finalizeMetadataVaryPath(
        '/hydrated/$d$thread/__PAGE__' as SegmentRequestKey,
        '' as any,
        {
          id: 'thread',
          value: 'first' as any,
          parent: null,
        } as any
      ),
      isPage: true as const,
      slots: null,
      prefetchHints: 0,
    }
    const secondTree = {
      ...firstTree,
      varyPath: finalizeMetadataVaryPath(
        '/hydrated/$d$thread/__PAGE__' as SegmentRequestKey,
        '' as any,
        {
          id: 'thread',
          value: 'second' as any,
          parent: null,
        } as any
      ),
    }

    const firstEntry = readOrCreateSegmentCacheEntry(
      now,
      FetchStrategy.PPR,
      firstTree,
      '/hydrated/__fallback'
    )
    const secondEntry = readOrCreateSegmentCacheEntry(
      now,
      FetchStrategy.PPR,
      secondTree,
      '/hydrated/__fallback'
    )

    expect(firstEntry).toBe(secondEntry)
    const secondThreadVaryPath = secondTree.varyPath.parent?.parent
    expect(secondThreadVaryPath).not.toBeNull()
    if (secondThreadVaryPath === null) {
      throw new Error('expected metadata vary path to include thread params')
    }
    expect(secondThreadVaryPath.value).toBe('second')
    expect(secondThreadVaryPath.value).not.toBe(Fallback)
  })

  it('rekeys runtime-prefetched fallback segments under generic params', () => {
    process.env.__NEXT_VARY_PARAMS = 'true'

    const now = Date.now()
    const makeTree = (thread: string) => ({
      requestKey: '/t/$d$threadId/__PAGE__' as SegmentRequestKey,
      segment: '/t/$d$threadId' as SegmentRequestKey,
      refreshState: null,
      varyPath: finalizePageVaryPath(
        '/t/$d$threadId/__PAGE__' as SegmentRequestKey,
        '' as any,
        {
          id: 'threadId',
          value: thread as any,
          parent: null,
        } as any
      ),
      isPage: true as const,
      slots: null,
      prefetchHints: 0,
    })

    const firstTree = makeTree('first')
    const secondTree = makeTree('second')
    const emptyEntry = readOrCreateSegmentCacheEntry(
      now,
      FetchStrategy.PPRRuntime,
      firstTree,
      '/t/__fallback'
    )
    expect(emptyEntry.status).toBe(EntryStatus.Empty)
    if (emptyEntry.status !== EntryStatus.Empty) {
      throw new Error('expected a new empty segment cache entry')
    }
    const ownedEntry = upgradeToPendingSegment(
      emptyEntry,
      FetchStrategy.PPRRuntime
    )
    const fulfilledVaryParams = new Set(['threadId'])
    const fulfilledVaryParamsThenable: VaryParamsThenable = {
      status: 'fulfilled',
      value: fulfilledVaryParams,
      then<TResult1 = Set<string>, TResult2 = never>(
        onfulfilled?:
          | ((value: Set<string>) => TResult1 | PromiseLike<TResult1>)
          | null,
        _onrejected?:
          | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
          | null
      ): PromiseLike<TResult1 | TResult2> {
        if (onfulfilled) {
          return Promise.resolve(onfulfilled(fulfilledVaryParams))
        }
        return Promise.resolve(fulfilledVaryParams as TResult1)
      },
    }

    writeDynamicRenderResponseIntoCache(
      now,
      FetchStrategy.PPRRuntime,
      [
        {
          segmentPath: [],
          pathToSegment: [],
          segment: '',
          tree: ['', {}],
          seedData: [
            'runtime fallback data',
            {},
            null,
            false,
            fulfilledVaryParamsThenable,
          ],
          head: null,
          isHeadPartial: false,
          isRootRender: true,
        },
      ],
      undefined,
      false,
      null,
      now + 30_000,
      {
        renderedSearch: '',
        routeTree: firstTree,
        metadataVaryPath: null,
        data: null,
        head: null,
        dynamicStaleAt: now + 30_000,
        outputExportFallbackBasePath: '/t/__fallback',
      },
      new Map([[firstTree.requestKey, ownedEntry]])
    )

    const secondEntry = readSegmentCacheEntry(now, secondTree.varyPath)

    expect(secondEntry).toBe(ownedEntry)
    expect(secondEntry?.status).toBe(EntryStatus.Fulfilled)
  })
})
