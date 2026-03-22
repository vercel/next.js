import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  RSC_HEADER,
} from '../../../client/components/app-router-headers'
import { parseReqUrl } from '../../../lib/url'
import { RSCPathnameNormalizer } from '../../normalizers/request/rsc'
import { SegmentPrefixRSCPathnameNormalizer } from '../../normalizers/request/segment-prefix-rsc'
import { normalizeAppPageRequestUrl } from './normalize-request-url'

type TestRequest = {
  headers: Record<string, string>
  url: string
}

describe('normalizeAppPageRequestUrl', () => {
  it('rewrites req.url for regular RSC requests', () => {
    const req: TestRequest = {
      headers: {},
      url: '/docs/frameworks/frontend.rsc?foo=bar',
    }
    const parsedUrl = parseReqUrl(req.url)!

    parsedUrl.pathname = new RSCPathnameNormalizer().normalize(
      parsedUrl.pathname!
    )
    req.headers[RSC_HEADER] = '1'

    normalizeAppPageRequestUrl(req, parsedUrl.pathname!)

    expect(parsedUrl.pathname).toBe('/docs/frameworks/frontend')
    expect(req.url).toBe('/docs/frameworks/frontend?foo=bar')
    expect(req.headers[RSC_HEADER]).toBe('1')
  })

  it('rewrites req.url for segment prefetch RSC requests', () => {
    const req: TestRequest = {
      headers: {},
      url: '/docs/frameworks/frontend.segments/_tree.segment.rsc?foo=bar',
    }
    const parsedUrl = parseReqUrl(req.url)!
    const result = new SegmentPrefixRSCPathnameNormalizer().extract(
      parsedUrl.pathname!
    )!

    parsedUrl.pathname = result.originalPathname
    req.headers[RSC_HEADER] = '1'
    req.headers[NEXT_ROUTER_PREFETCH_HEADER] = '1'
    req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] = result.segmentPath

    normalizeAppPageRequestUrl(req, parsedUrl.pathname)

    expect(parsedUrl.pathname).toBe('/docs/frameworks/frontend')
    expect(req.url).toBe('/docs/frameworks/frontend?foo=bar')
    expect(req.headers[RSC_HEADER]).toBe('1')
    expect(req.headers[NEXT_ROUTER_PREFETCH_HEADER]).toBe('1')
    expect(req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]).toBe('/_tree')
  })

  it('rewrites req.url for leaf page segment prefetch requests', () => {
    const req: TestRequest = {
      headers: {},
      url: '/docs/frameworks/frontend.segments/docs/frameworks/frontend/__PAGE__.segment.rsc?foo=bar',
    }
    const parsedUrl = parseReqUrl(req.url)!
    const result = new SegmentPrefixRSCPathnameNormalizer().extract(
      parsedUrl.pathname!
    )!

    parsedUrl.pathname = result.originalPathname
    req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] = result.segmentPath

    normalizeAppPageRequestUrl(req, parsedUrl.pathname)

    expect(parsedUrl.pathname).toBe('/docs/frameworks/frontend')
    expect(req.url).toBe('/docs/frameworks/frontend?foo=bar')
    expect(req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]).toBe(
      '/docs/frameworks/frontend/__PAGE__'
    )
  })
})
