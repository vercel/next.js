import {
  HEAD_REQUEST_KEY,
  type SegmentRequestKey,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import { FetchStrategy } from './types'
import { Fallback } from './cache-map'
import {
  getOutputExportSegmentRequestUrl,
  readOrCreateSegmentCacheEntry,
} from './cache'
import { finalizeMetadataVaryPath } from './vary-path'

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
    expect(secondTree.varyPath.parent.parent.value).toBe('second')
    expect(
      (
        secondTree.varyPath.parent
          .parent as typeof secondTree.varyPath.parent.parent
      ).value
    ).not.toBe(Fallback)
  })
})
