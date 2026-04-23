import { encodeCacheTagsHeaderValue } from './cache-tags-header'

describe('encodeCacheTagsHeaderValue', () => {
  it('returns ASCII values unchanged', () => {
    expect(encodeCacheTagsHeaderValue('_N_T_/layout')).toBe('_N_T_/layout')
    expect(
      encodeCacheTagsHeaderValue('_N_T_/layout,_N_T_/blog/layout,user-tag')
    ).toBe('_N_T_/layout,_N_T_/blog/layout,user-tag')
  })

  it('preserves ASCII characters that look special (`,`, `/`, `%`)', () => {
    expect(encodeCacheTagsHeaderValue('a,b/c%d')).toBe('a,b/c%d')
  })

  it('percent-encodes non-ASCII characters', () => {
    expect(encodeCacheTagsHeaderValue('_N_T_/מידע')).toBe(
      '_N_T_/%D7%9E%D7%99%D7%93%D7%A2'
    )
    expect(encodeCacheTagsHeaderValue('_N_T_/中文')).toBe(
      '_N_T_/%E4%B8%AD%E6%96%87'
    )
  })

  it('handles emoji (surrogate pairs) correctly', () => {
    expect(encodeCacheTagsHeaderValue('tag-🎉')).toBe('tag-%F0%9F%8E%89')
  })

  it('produces a value that passes HTTP header validation', () => {
    // Node rejects any code unit outside \t\x20-\x7e.
    const encoded = encodeCacheTagsHeaderValue(
      '_N_T_/layout,_N_T_/מידע,_N_T_/中文,_N_T_/🎉'
    )
    expect(encoded).toMatch(/^[\t\x20-\x7e]*$/)
  })

  it('mixes encoded and plain segments in a comma-joined list', () => {
    expect(encodeCacheTagsHeaderValue('_N_T_/layout,_N_T_/מידע,user-tag')).toBe(
      '_N_T_/layout,_N_T_/%D7%9E%D7%99%D7%93%D7%A2,user-tag'
    )
  })
})
