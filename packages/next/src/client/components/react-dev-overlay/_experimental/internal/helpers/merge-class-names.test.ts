import { mergeClassNames } from './merge-class-names'

describe('mergeClassNames', () => {
  it('should return an empty string for no arguments', () => {
    expect(mergeClassNames()).toBe('')
  })

  it('should join multiple string arguments with spaces', () => {
    expect(mergeClassNames('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  it('should filter out falsy values', () => {
    expect(mergeClassNames('foo', null, 'bar', undefined, 'baz', false)).toBe(
      'foo bar baz'
    )
  })

  it('should handle single string argument', () => {
    expect(mergeClassNames('foo')).toBe('foo')
  })

  it('should not add extra spaces when falsy values are between strings', () => {
    expect(mergeClassNames('foo', null, 'bar')).toBe('foo bar')
  })

  it('should handle all falsy values', () => {
    expect(mergeClassNames(null, undefined, false)).toBe('')
  })
})
