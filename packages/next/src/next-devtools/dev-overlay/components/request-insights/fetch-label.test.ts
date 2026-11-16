import { getFetchUrlPresentation, truncateMiddle } from './fetch-label'

describe('request insight fetch labels', () => {
  it('classifies same-origin and external fetches by full web origin', () => {
    expect(
      getFetchUrlPresentation('/api/items?token=redacted', 'https://app.test')
    ).toEqual({
      fullUrl: 'https://app.test/api/items?token=redacted',
      path: '/api/items?token=redacted',
      originKind: 'same-origin',
      originLabel: 'Same origin',
    })
    expect(
      getFetchUrlPresentation('https://api.test:445/items', 'https://app.test')
    ).toEqual({
      fullUrl: 'https://api.test:445/items',
      path: '/items',
      originKind: 'external',
      originLabel: 'External origin · api.test:445',
    })
    expect(
      getFetchUrlPresentation('http://app.test/items', 'https://app.test')
    ).toEqual({
      fullUrl: 'http://app.test/items',
      path: '/items',
      originKind: 'external',
      originLabel: 'External origin · http://app.test',
    })
  })

  it('does not guess origin semantics without a usable browser origin', () => {
    expect(
      getFetchUrlPresentation('https://api.test/items', undefined)
    ).toEqual({
      fullUrl: 'https://api.test/items',
      path: '/items',
      originKind: 'unknown',
      originLabel: 'https://api.test',
    })
    expect(getFetchUrlPresentation('/api/items', undefined)).toEqual({
      fullUrl: '/api/items',
      path: '/api/items',
      originKind: 'unknown',
      originLabel: 'Origin unavailable',
    })
  })

  it('middle-truncates labels while retaining their distinguishing suffix', () => {
    const value = '/api/a/very/long/path/to/tail-marker?token=redacted'
    const truncated = truncateMiddle(value, 28)

    expect(truncated).toHaveLength(28)
    expect(truncated).toContain('…')
    expect(truncated).toMatch(/token=redacted$/)

    expect(truncateMiddle('😀abc', 3)).toBe('😀…c')
    expect(truncateMiddle('secret', 1)).toBe('…')
    expect(truncateMiddle('secret', 0)).toBe('')
  })
})
