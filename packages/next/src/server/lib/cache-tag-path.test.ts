import { normalizePathnameToCacheTag } from './cache-tag-path'

describe('normalizePathnameToCacheTag()', () => {
  it('encodes non-ascii path segments', () => {
    expect(normalizePathnameToCacheTag('/wiki/ヤクルト')).toBe(
      '/wiki/%E3%83%A4%E3%82%AF%E3%83%AB%E3%83%88'
    )
  })

  it('does not double-encode already encoded path segments', () => {
    expect(
      normalizePathnameToCacheTag('/wiki/%E3%83%A4%E3%82%AF%E3%83%AB%E3%83%88')
    ).toBe('/wiki/%E3%83%A4%E3%82%AF%E3%83%AB%E3%83%88')
  })

  it('handles malformed segments by encoding them safely', () => {
    expect(normalizePathnameToCacheTag('/wiki/%E3%83%A4%ZZ')).toBe(
      '/wiki/%25E3%2583%25A4%25ZZ'
    )
  })
})
