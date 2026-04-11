import {
  HEAD_REQUEST_KEY,
  type SegmentRequestKey,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import { getOutputExportSegmentRequestUrl } from './cache'

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
