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

  it('should extract segment prefetch paths for catch-all params named segments', () => {
    const normalizer = new SegmentPrefixRSCPathnameNormalizer()
    const result = normalizer.extract(
      '/catch/[...segments].segments/catch/$c$segments/__PAGE__.segment.rsc'
    )

    expect(result).toEqual({
      originalPathname: '/catch/[...segments]',
      segmentPath: '/catch/$c$segments/__PAGE__',
    })
  })

  it('should still extract segment prefetch paths for other catch-all param names', () => {
    const normalizer = new SegmentPrefixRSCPathnameNormalizer()
    const result = normalizer.extract(
      '/catch/[...foobar].segments/catch/$c$foobar/__PAGE__.segment.rsc'
    )

    expect(result).toEqual({
      originalPathname: '/catch/[...foobar]',
      segmentPath: '/catch/$c$foobar/__PAGE__',
    })
  })
})
