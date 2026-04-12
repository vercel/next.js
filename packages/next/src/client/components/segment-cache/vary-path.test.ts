import { Fallback } from './cache-map'
import { FetchStrategy } from './types'
import {
  finalizeMetadataVaryPath,
  finalizePageVaryPath,
  getFulfilledSegmentVaryPath,
  getSegmentVaryPathForRequest,
} from './vary-path'

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
        requestKey: '/_head',
        segment: '/_head',
        refreshState: null,
        varyPath,
        isPage: true,
        slots: null,
        prefetchHints: 0,
      },
      null
    )

    expect(requestVaryPath.parent.parent.value).toBe('j97358')
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
        requestKey: '/t/$d$threadId/__PAGE__',
        segment: '/t/$d$threadId',
        refreshState: null,
        varyPath,
        isPage: true,
        slots: null,
        prefetchHints: 0,
      },
      '/t/__fallback'
    )

    expect(requestVaryPath.parent.value).toBe(Fallback)
    expect(requestVaryPath.parent.parent.value).toBe(Fallback)
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

    expect(fulfilledVaryPath.parent.value).toBe('')
    expect(fulfilledVaryPath.parent.parent.value).toBe(Fallback)
  })
})
