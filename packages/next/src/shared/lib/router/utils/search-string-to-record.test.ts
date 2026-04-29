import { searchStringToRecord } from './search-string-to-record'

describe('searchStringToRecord', () => {
  it('returns an empty object for an empty string', () => {
    expect(searchStringToRecord('')).toEqual({})
  })

  it('handles a leading "?" the same as no prefix', () => {
    expect(searchStringToRecord('?a=1')).toEqual({ a: '1' })
  })

  it('returns a string for a single-value key', () => {
    expect(searchStringToRecord('a=1')).toEqual({ a: '1' })
  })

  it('returns an object with multiple distinct keys', () => {
    expect(searchStringToRecord('a=1&b=2')).toEqual({ a: '1', b: '2' })
  })

  it('returns an array for a repeated key', () => {
    expect(searchStringToRecord('a=1&a=2')).toEqual({ a: ['1', '2'] })
  })

  it('preserves repetition order in the array', () => {
    expect(searchStringToRecord('a=1&a=2&a=3')).toEqual({
      a: ['1', '2', '3'],
    })
  })

  it('keeps empty values as empty strings', () => {
    expect(searchStringToRecord('a=&a=')).toEqual({ a: ['', ''] })
  })

  it('does not collapse repeated keys when other keys appear in between', () => {
    expect(searchStringToRecord('a=1&b=2&a=3')).toEqual({
      a: ['1', '3'],
      b: '2',
    })
  })

  it('produces different stringified shapes for URLs that share only the trailing value', () => {
    const before = JSON.stringify(
      searchStringToRecord('color=red&color=green&color=blue')
    )
    const after = JSON.stringify(searchStringToRecord('color=red&color=blue'))
    expect(before).not.toBe(after)
  })
})
