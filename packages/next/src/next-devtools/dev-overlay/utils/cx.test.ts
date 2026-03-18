import { cx } from './cx'

describe('cx', () => {
  it('should return an empty string for no arguments', () => {
    expect(cx()).toBe('')
  })

  it('should join multiple string arguments with spaces', () => {
    expect(cx('foo', 'bar', 'baz')).toBe('foo bar baz')
  })

  it('should filter out falsy values', () => {
    expect(cx('foo', null, 'bar', undefined, 'baz', false)).toBe('foo bar baz')
  })

  it('should handle single string argument', () => {
    expect(cx('foo')).toBe('foo')
  })

  it('should not add extra spaces when falsy values are between strings', () => {
    expect(cx('foo', null, 'bar')).toBe('foo bar')
  })

  it('should handle all falsy values', () => {
    expect(cx(null, undefined, false)).toBe('')
  })
})
