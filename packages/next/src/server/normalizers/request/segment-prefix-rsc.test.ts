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

  it('should handle doubled segment suffixes without creating infinite loops', () => {
    const normalizer = new SegmentPrefixRSCPathnameNormalizer()

    // This test demonstrates the bug: when a path already contains .segments/_tree.segment.rsc,
    // the greedy regex fails to properly strip it, leading to infinite redirect loops
    const doubledPath =
      '/app/poggio-dogfood.segments/_tree.segment.rsc.segments/_tree.segment.rsc'

    const result = normalizer.extract(doubledPath)

    // With the fixed non-greedy regex, this should properly extract the clean pathname
    // The key fix: originalPathname should NOT contain any .segments suffixes
    expect(result).toEqual({
      originalPathname: '/app/poggio-dogfood',
      segmentPath: '/_tree.segment.rsc.segments/_tree',
    })

    // This prevents infinite redirect loops by ensuring the original pathname is clean
  })

  it('should handle complex nested segment suffixes', () => {
    const normalizer = new SegmentPrefixRSCPathnameNormalizer()

    // Even more complex case that would happen after multiple redirects
    const tripleNestedPath =
      '/app/test.segments/_tree.segment.rsc.segments/_tree.segment.rsc.segments/_tree.segment.rsc'

    const result = normalizer.extract(tripleNestedPath)

    // Should always extract the clean original pathname, regardless of nesting depth
    // The non-greedy regex captures everything after the first .segments in segmentPath
    expect(result).toEqual({
      originalPathname: '/app/test',
      segmentPath:
        '/_tree.segment.rsc.segments/_tree.segment.rsc.segments/_tree',
    })
  })
})
