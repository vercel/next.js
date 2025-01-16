import { SegmentPrefixRSCPathnameNormalizer } from './segment-prefix-rsc'

describe('SegmentPrefixRSCPathnameNormalizer', () => {
  it('should match and extract the original pathname and segment path', () => {
    const normalizer = new SegmentPrefixRSCPathnameNormalizer()
    const result = normalizer.extract('/hello/hello.segments/_tree.segment.rsc')
    expect(result).toEqual({
      originalPathname: '/hello/hello',
      segmentPath: '/_tree',
    })
  })
})
