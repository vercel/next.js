import { Fallback } from './cache-map'
import { FetchStrategy } from './types'
import {
  HEAD_REQUEST_KEY,
  type SegmentRequestKey,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import {
  finalizeMetadataVaryPath,
  finalizePageVaryPath,
  getFulfilledSegmentVaryPath,
  getSegmentVaryPathForRequest,
} from './vary-path'

function getRequiredParent<T extends { parent: unknown | null }>(
  path: T
): Exclude<T['parent'], null> {
  expect(path.parent).not.toBeNull()
  return path.parent as Exclude<T['parent'], null>
}

describe('getSegmentVaryPathForRequest output export fallback', () => {
  it('reuses path params for normal static prefetches', () => {
    const varyPath = finalizeMetadataVaryPath(
      '/t/$d$threadId/__PAGE__',
      '' as any,
      {
        id: 'threadId',
        value: 'j97358' as any,
        parent: null,
      } as any
    )

    const requestVaryPath = getSegmentVaryPathForRequest(
      FetchStrategy.PPR,
      {
        requestKey: HEAD_REQUEST_KEY,
        segment: HEAD_REQUEST_KEY,
        refreshState: null,
        varyPath,
        isPage: true,
        slots: null,
        prefetchHints: 0,
      },
      null
    )

    expect(getRequiredParent(getRequiredParent(requestVaryPath)).value).toBe(
      'j97358'
    )
  })

  it('treats path params as reusable for learned output export fallback routes', () => {
    const varyPath = finalizePageVaryPath(
      '/t/$d$threadId/__PAGE__',
      '' as any,
      {
        id: 'threadId',
        value: 'j97358' as any,
        parent: null,
      } as any
    )

    const requestVaryPath = getSegmentVaryPathForRequest(
      FetchStrategy.PPR,
      {
        requestKey: '/t/$d$threadId/__PAGE__' as SegmentRequestKey,
        segment: '/t/$d$threadId' as SegmentRequestKey,
        refreshState: null,
        varyPath,
        isPage: true,
        slots: null,
        prefetchHints: 0,
      },
      '/t/__fallback'
    )

    expect(getRequiredParent(requestVaryPath).value).toBe(Fallback)
    expect(getRequiredParent(getRequiredParent(requestVaryPath)).value).toBe(
      Fallback
    )
  })

  it('keeps fulfilled fallback segment path params generic even when vary params include them', () => {
    const varyPath = finalizeMetadataVaryPath(
      '/t/$d$threadId/__PAGE__',
      '' as any,
      {
        id: 'threadId',
        value: 'j97358' as any,
        parent: null,
      } as any
    )

    const fulfilledVaryPath = getFulfilledSegmentVaryPath(
      varyPath,
      new Set(['?', 'threadId']),
      true
    )

    expect(getRequiredParent(fulfilledVaryPath).value).toBe('')
    expect(getRequiredParent(getRequiredParent(fulfilledVaryPath)).value).toBe(
      Fallback
    )
  })
})
