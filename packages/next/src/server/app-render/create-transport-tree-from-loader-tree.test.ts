import { getMissingPrefetchHintPolicy } from './create-transport-tree-from-loader-tree'

describe('getMissingPrefetchHintPolicy', () => {
  it('marks missing build-time hints as stale', () => {
    expect(getMissingPrefetchHintPolicy(true, true, false)).toBe('mark-stale')
  })

  it('gives the build-time policy precedence over runtime fallbacks', () => {
    expect(getMissingPrefetchHintPolicy(true, false, true)).toBe('mark-stale')
  })

  it('disables prefetching for runtime prerenders', () => {
    expect(getMissingPrefetchHintPolicy(false, true, false)).toBe(
      'disable-prefetching'
    )
  })

  it('disables prefetching for dynamic Cache Components routes', () => {
    expect(getMissingPrefetchHintPolicy(false, false, true)).toBe(
      'disable-prefetching'
    )
  })

  it('does not apply a fallback to dynamic routes without Cache Components', () => {
    expect(getMissingPrefetchHintPolicy(false, false, false)).toBe('none')
  })
})
